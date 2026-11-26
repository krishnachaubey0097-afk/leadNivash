import crypto from 'crypto';
import mongoose from 'mongoose';
import { User } from '../users/user.model.js';
import { Buyer } from '../buyers/buyer.model.js';
import { Property } from '../properties/property.model.js';
import { LeadSubmission } from './leadSubmission.model.js';
import { ActivityLog } from '../activity/activityLog.model.js';
import { NotificationService } from '../notifications/notification.service.js';
import { Matcher } from '../matches/matcher.js';
import { convertToGaj, type SupportedUnit } from '../../utils/units.js';
import { normalizePhoneE164 } from '../../utils/phone.js';
import { formatShortINR } from '../../utils/money.js';
import { logger } from '../../services/logger.service.js';
import type { SubmitLeadFormDto } from './leadForm.schema.js';

export interface PublicLeadFormProfile {
  brokerId: string;
  brokerName: string;
  agencyName: string;
  city: string;
  state: string;
  phone?: string;
}

export class LeadFormService {
  /**
   * Fetch safe public metadata about the broker owning a shared Lead Form link.
   * Never exposes private account settings, email, or session fields.
   */
  static async getPublicProfile(brokerId: string): Promise<PublicLeadFormProfile> {
    if (!mongoose.Types.ObjectId.isValid(brokerId)) {
      const err: any = new Error('Lead form link not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const user = await User.findOne({
      _id: brokerId,
      isDeleted: false,
      isDisabled: false,
    })
      .select('name phone agency preferences.defaultCity preferences.defaultState')
      .lean();

    if (!user) {
      const err: any = new Error('This broker lead form link is unavailable or inactive');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    return {
      brokerId: user._id.toString(),
      brokerName: user.name || 'Real Estate Advisor',
      agencyName: user.agency?.name?.trim() || `${user.name || 'LeadNivash'} Properties`,
      city: user.agency?.city?.trim() || user.preferences?.defaultCity || 'Panipat',
      state: user.preferences?.defaultState || 'Haryana',
      phone: user.phone || undefined,
    };
  }

  /**
   * Handle public Buyer or Seller lead form submission.
   * Persists LeadSubmission + real Buyer or Property record under the broker's userId,
   * emits ActivityLog, and notifies the broker immediately.
   */
  static async submitLead(
    brokerId: string,
    data: SubmitLeadFormDto,
    ipAddress: string
  ): Promise<{
    success: boolean;
    submissionId?: string;
    category: 'buyer' | 'seller';
    recordId?: string;
    summary?: string;
  }> {
    // 1. Honeypot anti-bot guard
    if (data.website && data.website.trim() !== '') {
      logger.warn('Spam lead form submission silently dropped', { ip: ipAddress });
      return { success: true, category: data.category };
    }

    // 2. Verify target broker exists & is active
    const broker = await User.findOne({
      _id: brokerId,
      isDeleted: false,
      isDisabled: false,
    })
      .select('name agency preferences')
      .lean();

    if (!broker) {
      const err: any = new Error('Broker lead form link is unavailable');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const phoneE164 = normalizePhoneE164(data.phone);
    const cleanEmail = data.email?.trim()?.toLowerCase() || undefined;
    const ipHash = crypto.createHash('sha256').update(ipAddress).digest('hex');
    const marlaToGaj = broker.preferences?.marlaToGaj || 30.25;
    const defaultCity = data.city?.trim() || broker.agency?.city || broker.preferences?.defaultCity || 'Panipat';

    let buyerId: mongoose.Types.ObjectId | undefined;
    let propertyId: mongoose.Types.ObjectId | undefined;
    let localitySummary = defaultCity;
    let requirementSummary = '';

    if (data.category === 'buyer') {
      const cleanLocalities = (data.localities || [])
        .map((l) => l.trim())
        .filter(Boolean)
        .map((display) => ({
          display,
          key: display
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'general',
        }));

      const anyLocality = Boolean(data.anyLocality) || cleanLocalities.length === 0;
      const cleanTypes = (data.types || []).map((t) => t.trim()).filter(Boolean);

      // Compute approximate ±15% band when client marks approximate budget
      const budgetMinPaise = data.isApproxBudget
        ? Math.max(10000, Math.round(data.budgetPaise * 0.85))
        : undefined;
      const budgetMaxPaise = data.isApproxBudget
        ? Math.round(data.budgetPaise * 1.15)
        : data.budgetPaise;

      let sizeGajObj: { min?: number; max?: number } | undefined;
      if (data.sizeMin || data.sizeMax) {
        const minConv = data.sizeMin
          ? convertToGaj(data.sizeMin, (data.sizeUnit || 'gaj') as SupportedUnit, marlaToGaj)
          : null;
        const maxConv = data.sizeMax
          ? convertToGaj(data.sizeMax, (data.sizeUnit || 'gaj') as SupportedUnit, marlaToGaj)
          : null;
        if (minConv?.sizeGaj || maxConv?.sizeGaj) {
          sizeGajObj = {
            ...(minConv?.sizeGaj ? { min: Math.round(minConv.sizeGaj) } : {}),
            ...(maxConv?.sizeGaj ? { max: Math.round(maxConv.sizeGaj) } : {}),
          };
        }
      }

      const noteLines = [
        data.isApproxBudget
          ? `Entered Budget: ~${formatShortINR(data.budgetPaise)} (Approx ±15% flexible)`
          : `Budget: ${formatShortINR(data.budgetPaise)}`,
        cleanEmail ? `Email: ${cleanEmail}` : '',
        defaultCity ? `Preferred City: ${defaultCity}` : '',
        data.notes?.trim() ? `Client Requirements: ${data.notes.trim()}` : '',
      ].filter(Boolean);

      const buyer = await Buyer.create({
        userId: broker._id,
        name: data.name.trim(),
        phoneE164,
        email: cleanEmail,
        localities: cleanLocalities,
        anyLocality,
        types: cleanTypes.length > 0 ? cleanTypes : ['Floor', 'Plot'],
        purpose: data.purpose || 'Sale',
        budget: {
          minPaise: budgetMinPaise,
          maxPaise: budgetMaxPaise,
          isApproximate: Boolean(data.isApproxBudget),
        },
        sizeGaj: sizeGajObj,
        urgency: data.urgency || 'warm',
        status: 'active',
        notes: noteLines.join(' · '),
        source: 'lead_form',
      });

      buyerId = buyer._id;
      localitySummary = cleanLocalities.map((l) => l.display).join(', ') || `Any Locality (${defaultCity})`;
      requirementSummary = `${cleanTypes.join(', ') || 'Property'} (${data.purpose || 'Sale'})`;

      // Audit log + notification (best-effort)
      try {
        await Promise.all([
          ActivityLog.create({
            userId: broker._id,
            type: 'buyer_created',
            entityType: 'buyer',
            entityId: buyer._id,
            meta: { name: buyer.name, urgency: buyer.urgency, source: 'lead_form' },
          }),
          NotificationService.createNotification(
            broker._id,
            'New Buyer Lead via Share Form',
            `${data.name.trim()} shared a ${requirementSummary} requirement in ${localitySummary} (${data.isApproxBudget ? '~' : ''}${formatShortINR(data.budgetPaise)}).`,
            'inquiry',
            { buyerId: buyer._id.toString(), category: 'buyer', source: 'lead_form' }
          ),
        ]);
      } catch (err: any) {
        logger.warn(`LeadForm buyer activity/notification skipped: ${err.message}`);
      }
    } else {
      // Seller flow -> create available Property listing with Owner Vault populated
      const sizeVal = data.sizeValue || 100;
      const sizeUnit = (data.sizeUnit || 'gaj') as SupportedUnit;
      const unitConv = convertToGaj(sizeVal, sizeUnit, marlaToGaj);
      const sizeGaj = unitConv.sizeGaj || sizeVal;

      const locality = (data.locality || defaultCity).trim();
      const localityKey = locality.toLowerCase().replace(/\s+/g, '-');
      const propType = data.propertyType || 'Floor';
      const title = `${sizeVal} ${sizeUnit.toUpperCase()} ${propType} — ${locality}`;

      const sellerNotes = [
        data.isApproxBudget ? 'Asking price is approximate / negotiable.' : '',
        cleanEmail ? `Email: ${cleanEmail}` : '',
        data.notes?.trim() || '',
      ]
        .filter(Boolean)
        .join(' · ');

      const property = await Property.create({
        userId: broker._id,
        title,
        type: propType,
        category: data.propertyCategory || 'Residential',
        purpose: data.purpose || 'Sale',
        locality,
        localityKey,
        city: defaultCity,
        landmark: data.landmark?.trim() || undefined,
        size: { value: sizeVal, unit: sizeUnit },
        sizeGaj,
        priceDemandPaise: data.budgetPaise,
        isApproxPrice: Boolean(data.isApproxBudget),
        facing: data.facing?.trim() || undefined,
        tags: data.highlights || [],
        description: data.notes?.trim() || `Direct seller submission from ${data.name.trim()}`,
        status: 'available',
        owner: {
          name: data.name.trim(),
          phone: phoneE164,
          email: cleanEmail,
          notes: sellerNotes || undefined,
        },
        source: 'lead_form',
      });

      propertyId = property._id;
      localitySummary = `${locality}, ${defaultCity}`;
      requirementSummary = `${title} (${data.purpose || 'Sale'})`;

      try {
        const reverseMatchCount = await Matcher.countReverseMatches(property, broker._id.toString());
        await Promise.all([
          ActivityLog.create({
            userId: broker._id,
            type: 'property_created',
            entityType: 'property',
            entityId: property._id,
            meta: { type: property.type, locality: property.locality, sizeGaj, source: 'lead_form' },
          }),
          NotificationService.createNotification(
            broker._id,
            'New Seller Property via Share Form',
            `${data.name.trim()} submitted "${title}" at ${data.isApproxBudget ? '~' : ''}${formatShortINR(data.budgetPaise)}${reverseMatchCount > 0 ? ` · ${reverseMatchCount} buyer match${reverseMatchCount === 1 ? '' : 'es'} ready` : ''}.`,
            'inquiry',
            { propertyId: property._id.toString(), category: 'seller', source: 'lead_form' }
          ),
        ]);
      } catch (err: any) {
        logger.warn(`LeadForm seller activity/notification skipped: ${err.message}`);
      }
    }

    // 3. Persist LeadSubmission audit trail record
    const submission = await LeadSubmission.create({
      brokerId: broker._id,
      category: data.category,
      buyerId,
      propertyId,
      name: data.name.trim(),
      phoneE164,
      email: cleanEmail,
      purpose: data.purpose || 'Sale',
      budgetPaise: data.budgetPaise,
      isApproxBudget: Boolean(data.isApproxBudget),
      localitySummary,
      requirementSummary,
      notes: data.notes?.trim() || undefined,
      ipHash,
      status: 'new',
    });

    return {
      success: true,
      submissionId: submission._id.toString(),
      category: data.category,
      recordId: (buyerId || propertyId)?.toString(),
      summary: requirementSummary,
    };
  }

  /**
   * List authenticated broker's form submissions (both buyer & seller).
   */
  static async listBrokerSubmissions(userId: string, query: { page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = Math.min(50, query.limit || 20);
    const skip = (page - 1) * limit;

    const filter = { brokerId: new mongoose.Types.ObjectId(userId) };
    const [items, total] = await Promise.all([
      LeadSubmission.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      LeadSubmission.countDocuments(filter),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
