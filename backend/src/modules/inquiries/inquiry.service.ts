import crypto from 'crypto';
import mongoose from 'mongoose';
import { Inquiry } from './inquiry.model.js';
import { Property } from '../properties/property.model.js';
import { ActivityLog } from '../activity/activityLog.model.js';
import { normalizePhoneE164 } from '../../utils/phone.js';
import type { CreateInquiryDto } from './inquiry.schema.js';
import { logger } from '../../services/logger.service.js';

export class InquiryService {
  /**
   * Records a public inquiry from a shared flyer or portal page.
   * Includes bot honeypot detection and IP hashing.
   * Emits an ActivityLog entry for the property broker (NO PII).
   */
  static async submitInquiry(
    data: CreateInquiryDto,
    ipAddress: string
  ): Promise<{ success: boolean; id?: string }> {
    // 1. Honeypot check: If bot filled the hidden "website" field, silently drop
    if (data.website && data.website.trim() !== '') {
      logger.warn('Spam inquiry dropped via honeypot trap', { ip: ipAddress });
      return { success: true }; // Return fake success to deceive spam bot
    }

    // 2. Validate property existence
    const property = await Property.findOne({ _id: data.propertyId, isDeleted: false });
    if (!property) {
      const err: any = new Error('Property listing not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    // 3. Normalize phone
    const phoneE164 = normalizePhoneE164(data.phone);

    // 4. Hash IP address for privacy
    const ipHash = crypto.createHash('sha256').update(ipAddress).digest('hex');

    // 5. Create inquiry
    const inquiry = await Inquiry.create({
      propertyId: data.propertyId,
      shareLinkId: data.shareLinkId,
      name: data.name.trim(),
      phoneE164,
      message: data.message?.trim(),
      ipHash,
      status: 'new',
    });

    // 6. Log Activity for broker (strictly NO PII: only property metadata)
    try {
      await ActivityLog.create({
        userId: property.userId,
        type: 'inquiry_received',
        entityType: 'property',
        entityId: property._id,
        meta: {
          propertyTitle: property.title || 'Property',
        },
      });
    } catch (err: any) {
      logger.warn(`Failed to create inquiry ActivityLog: ${err.message}`);
    }

    return {
      success: true,
      id: inquiry._id.toString(),
    };
  }

  /**
   * List inquiries for properties owned by the authenticated broker.
   */
  static async listBrokerInquiries(userId: string, query: { page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = Math.min(50, query.limit || 20);
    const skip = (page - 1) * limit;

    const userProps = await Property.find({ userId, isDeleted: false }).select('_id');
    const propIds = userProps.map((p) => p._id);

    const filter = { propertyId: mongoose.trusted({ $in: propIds }) };

    const [items, total] = await Promise.all([
      Inquiry.find(filter)
        .populate('propertyId', 'title locality priceDemandPaise')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Inquiry.countDocuments(filter),
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

  /**
   * List inquiries for a property or admin.
   */
  static async listInquiries(query: { propertyId?: string; page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = Math.min(50, query.limit || 20);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (query.propertyId) filter.propertyId = query.propertyId;

    const [items, total] = await Promise.all([
      Inquiry.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Inquiry.countDocuments(filter),
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
