import mongoose from 'mongoose';
import { GeminiProvider } from './llm/geminiProvider.js';
import type { ILLMProvider } from './llm/llmProvider.interface.js';
import { tokenizePhones, detokenizePhones } from './tokenizer.js';
import { convertToGaj, type SupportedUnit } from '../../utils/units.js';
import { parseInrToPaise } from '../../utils/money.js';
import { LocalityAliasService } from '../aliases/alias.service.js';
import { normalizePhoneE164 } from '../../utils/phone.js';
import { ParseLog } from './parseLog.model.js';
import { UsageCounter, getCurrentPeriod } from '../usage/usageCounter.model.js';
import { User } from '../users/user.model.js';
import { Property, type IProperty } from '../properties/property.model.js';
import { Buyer, type IBuyer } from '../buyers/buyer.model.js';
import { ActivityLog } from '../activity/activityLog.model.js';
import type { ParseCommitDto } from './parse.schema.js';

export class ParseService {
  private static llmProvider: ILLMProvider = new GeminiProvider();

  /**
   * Allows setting a custom/mock LLM provider for tests or evaluations.
   */
  static setLLMProvider(provider: ILLMProvider): void {
    this.llmProvider = provider;
  }

  /**
   * Parse raw WhatsApp / broker text into normalized preview structure.
   * Checks monthly plan quota and logs metadata without storing raw text or PII.
   */
  static async parseText(userId: string, rawText: string, marlaToGaj = 30.25) {
    const period = getCurrentPeriod();

    // 1. Quota check against user plan
    const user = await User.findById(userId).select('plan');
    if (user && user.plan) {
      const usage = await UsageCounter.findOne({ userId, period });
      const currentParses = usage ? usage.parses : 0;
      if (currentParses >= user.plan.limits.maxParsesMonthly) {
        const err: any = new Error(
          `Monthly parse limit reached (${user.plan.limits.maxParsesMonthly} parses/month). Please upgrade your plan.`
        );
        err.statusCode = 402;
        err.code = 'PLAN_LIMIT_REACHED';
        throw err;
      }
    }

    // 2. Tokenize phones to shield PII from LLM
    const { tokenizedText, phoneMap } = tokenizePhones(rawText);

    // 3. Extract through LLM provider (or fallback)
    const { data: rawOutput, meta } = await this.llmProvider.parse(tokenizedText);

    // 4. Detokenize phone numbers back
    const output = detokenizePhones(rawOutput, phoneMap);

    // 5. Server-side normalizations
    const warnings: string[] = [...(output.warnings || [])];

    if (output.itemType === 'listing' && output.extracted?.property) {
      const prop = output.extracted.property;

      // Locality resolution
      if (prop.locality) {
        prop.locality = await LocalityAliasService.resolve(prop.locality, prop.city || 'Panipat', userId);
      }

      // Unit normalization
      if (prop.sizeValue && prop.sizeUnit) {
        const conv = convertToGaj(prop.sizeValue, prop.sizeUnit as SupportedUnit, marlaToGaj);
        if (conv.sizeGaj !== null) {
          (prop as any).sizeGaj = conv.sizeGaj;
        } else if (conv.warning) {
          warnings.push(conv.warning);
        }
      }

      // Price normalization
      if (prop.priceDemandRaw && !prop.priceDemandPaise) {
        try {
          prop.priceDemandPaise = parseInrToPaise(prop.priceDemandRaw);
        } catch {
          warnings.push(`Could not parse price from "${prop.priceDemandRaw}"`);
        }
      }

      // Phone formatting
      if (prop.ownerPhone) {
        try {
          prop.ownerPhone = normalizePhoneE164(prop.ownerPhone);
        } catch {
          // Keep as is
        }
      }
    } else if (output.itemType === 'buyer' && output.extracted?.buyer) {
      const b = output.extracted.buyer;

      // Locality resolution for all localities
      if (Array.isArray(b.localities) && b.localities.length > 0) {
        const canonicalLocalities: string[] = [];
        for (const loc of b.localities) {
          const resolved = await LocalityAliasService.resolve(loc, 'Panipat', userId);
          canonicalLocalities.push(resolved);
        }
        b.localities = [...new Set(canonicalLocalities)];
      }

      // Budget normalization
      if (b.budgetRaw && !b.budgetMaxPaise) {
        try {
          b.budgetMaxPaise = parseInrToPaise(b.budgetRaw);
          if (!b.budgetMinPaise) {
            b.budgetMinPaise = Math.round(b.budgetMaxPaise * 0.7);
          }
        } catch {
          warnings.push(`Could not parse budget from "${b.budgetRaw}"`);
        }
      }

      // Phone formatting
      if (b.phone) {
        try {
          b.phone = normalizePhoneE164(b.phone);
        } catch {
          // Keep as is
        }
      }
    }

    // 6. Record ParseLog (Strict privacy: NO raw text or PII recorded)
    await ParseLog.create({
      userId,
      inputChars: rawText.length,
      itemsCount: 1,
      model: meta.model,
      tokensIn: meta.tokensIn || 0,
      tokensOut: meta.tokensOut || 0,
      latencyMs: meta.latencyMs,
      ok: true,
      costEstimate: meta.costEstimate || 0,
    });

    // 7. Increment usage counter
    await UsageCounter.findOneAndUpdate(
      { userId, period },
      { $inc: { parses: 1 } },
      { upsert: true, returnDocument: 'after' }
    );

    output.warnings = warnings;
    return {
      preview: output,
      meta,
    };
  }

  /**
   * Commit parsed preview data to the database in an all-or-nothing MongoDB transaction.
   */
  static async commit(userId: string, payload: ParseCommitDto, marlaToGaj = 30.25) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      let createdEntity: any;

      if (payload.itemType === 'listing') {
        const d = payload.data as any;

        // Ensure canonical sizeGaj
        let sizeGaj = d.sizeGaj;
        if (!sizeGaj && d.size?.value && d.size?.unit) {
          const conv = convertToGaj(d.size.value, d.size.unit as SupportedUnit, marlaToGaj);
          if (conv.sizeGaj === null) {
            throw new Error(conv.warning || 'Invalid size unit');
          }
          sizeGaj = conv.sizeGaj;
        }

        const locality = d.locality || 'Panipat';
        const localityKey = locality.toLowerCase().trim().replace(/\s+/g, '-');
        const type = d.type || 'Plot';
        const title = d.title || `${sizeGaj} Gaj ${type} in ${locality}`;

        const created = (await Property.create(
          [
            {
              userId,
              title,
              type,
              category: d.category || 'Residential',
              purpose: d.purpose || 'Sale',
              locality,
              localityKey,
              city: d.city || 'Panipat',
              landmark: d.landmark,
              size: d.size || { value: sizeGaj, unit: 'gaj' },
              sizeGaj,
              priceDemandPaise: d.priceDemandPaise,
              facing: d.facing,
              tags: d.tags || [],
              description: d.description,
              status: 'available',
              photos: d.photos || [],
              owner: d.owner || {
                name: d.ownerName,
                phone: d.ownerPhone,
                notes: d.ownerNotes,
              },
              source: 'paste',
              isDeleted: false,
            },
          ] as any[],
          { session }
        )) as unknown as IProperty[];

        const newProp = created[0];
        if (!newProp) {
          throw new Error('Failed to create property in transaction');
        }

        await ActivityLog.create(
          [
            {
              userId,
              type: 'property_created',
              entityType: 'property',
              entityId: newProp._id,
              meta: { source: 'paste', type, locality, sizeGaj },
            },
          ],
          { session }
        );

        createdEntity = newProp;
      } else if (payload.itemType === 'buyer') {
        const d = payload.data as any;
        const phoneE164 = d.phoneE164 || (d.phone ? normalizePhoneE164(d.phone) : '+919999999999');

        const rawLocalities = d.localities || [];
        const normalizedLocalities = rawLocalities.map((loc: any) => {
          if (typeof loc === 'string') {
            return {
              display: loc.trim(),
              key: loc.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general',
            };
          }
          return loc;
        });

        const created = (await Buyer.create(
          [
            {
              userId,
              name: d.name || 'Client',
              phoneE164,
              types: d.types || ['Plot'],
              purpose: d.purpose || 'Sale',
              localities: normalizedLocalities,
              anyLocality: d.anyLocality ?? (normalizedLocalities.length === 0),
              budget: d.budget || {
                minPaise: d.budgetMinPaise || Math.round((d.budgetMaxPaise || 100000000) * 0.7),
                maxPaise: d.budgetMaxPaise || 100000000,
              },
              sizeGaj: d.sizeGaj || (d.size ? { min: d.size.minGaj || d.size.min, max: d.size.maxGaj || d.size.max } : undefined),
              urgency: d.urgency || 'warm',
              notes: d.notes,
              rawText: d.rawText,
              status: 'active',
              isDeleted: false,
            },
          ] as any[],
          { session }
        )) as unknown as IBuyer[];

        const newBuyer = created[0];
        if (!newBuyer) {
          throw new Error('Failed to create buyer in transaction');
        }

        await ActivityLog.create(
          [
            {
              userId,
              type: 'buyer_created',
              entityType: 'buyer',
              entityId: newBuyer._id,
              meta: { source: 'paste', urgency: newBuyer.urgency },
            },
          ],
          { session }
        );

        createdEntity = newBuyer;
      }

      await session.commitTransaction();
      session.endSession();

      return {
        success: true,
        itemType: payload.itemType,
        item: createdEntity,
      };
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  }
}
