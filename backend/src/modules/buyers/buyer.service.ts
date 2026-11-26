import { Buyer, type IBuyer } from './buyer.model.js';
import { assertOwnership } from '../../utils/ownershipCheck.js';
import { ActivityLog } from '../activity/activityLog.model.js';
import { escapeSearchRegex } from '../properties/property.service.js';
import { normalizePhoneE164 } from '../../utils/phone.js';

export class BuyerService {
  static async create(userId: string, data: any): Promise<{ buyer: IBuyer; duplicateWarning?: string }> {
    const phoneE164 = normalizePhoneE164(data.phone);

    // Duplicate check warning
    const existing = await Buyer.findOne({
      userId,
      phoneE164,
      isDeleted: false,
    });

    let duplicateWarning: string | undefined;
    if (existing) {
      duplicateWarning = `A buyer with phone number ${phoneE164} already exists (${existing.name}).`;
    }

    const buyer = new Buyer({
      userId,
      name: data.name.trim(),
      phoneE164,
      email: data.email?.trim()?.toLowerCase() || undefined,
      localities: data.localities || [],
      anyLocality: !!data.anyLocality,
      types: data.types || [],
      purpose: data.purpose || 'Sale',
      budget: data.budget,
      sizeGaj: data.sizeGaj,
      urgency: data.urgency || 'warm',
      status: data.status || 'active',
      notes: data.notes?.trim(),
      rawText: data.rawText?.trim(),
      source: data.source || 'manual',
    });

    await buyer.save();

    await ActivityLog.create({
      userId,
      type: 'buyer_created',
      entityType: 'buyer',
      entityId: buyer._id,
      meta: { name: buyer.name, urgency: buyer.urgency },
    });

    return { buyer, duplicateWarning };
  }

  static async list(
    userId: string,
    query: { page?: number; limit?: number; status?: string; urgency?: string; search?: string }
  ) {
    const page = query.page || 1;
    const limit = Math.min(50, query.limit || 20);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      userId,
      isDeleted: false,
    };

    if (query.status) filter.status = query.status;
    if (query.urgency) filter.urgency = query.urgency;

    if (query.search && query.search.trim()) {
      const escaped = escapeSearchRegex(query.search.trim());
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { phoneE164: { $regex: escaped, $options: 'i' } },
        { 'localities.display': { $regex: escaped, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      Buyer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Buyer.countDocuments(filter),
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

  static async getById(userId: string, id: string): Promise<IBuyer> {
    return assertOwnership(Buyer, id, userId);
  }

  static async update(userId: string, id: string, data: any): Promise<IBuyer> {
    const buyer = await assertOwnership(Buyer, id, userId);

    if (data.name) buyer.name = data.name.trim();
    if (data.phone) buyer.phoneE164 = normalizePhoneE164(data.phone);
    if (data.email !== undefined) buyer.email = data.email?.trim()?.toLowerCase() || undefined;
    if (data.localities) buyer.localities = data.localities;
    if (data.anyLocality !== undefined) buyer.anyLocality = data.anyLocality;
    if (data.types) buyer.types = data.types;
    if (data.purpose) buyer.purpose = data.purpose;
    if (data.budget) buyer.budget = data.budget;
    if (data.sizeGaj !== undefined) buyer.sizeGaj = data.sizeGaj;
    if (data.urgency) buyer.urgency = data.urgency;
    if (data.status) buyer.status = data.status;
    if (data.notes !== undefined) buyer.notes = data.notes?.trim();

    await buyer.save();

    await ActivityLog.create({
      userId,
      type: 'buyer_updated',
      entityType: 'buyer',
      entityId: buyer._id,
    });

    return buyer;
  }

  static async delete(userId: string, id: string): Promise<void> {
    const buyer = await assertOwnership(Buyer, id, userId);
    buyer.isDeleted = true;
    buyer.deletedAt = new Date();
    await buyer.save();
  }
}

