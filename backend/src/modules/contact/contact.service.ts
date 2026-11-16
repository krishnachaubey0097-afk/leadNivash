import crypto from 'crypto';
import { ContactLead } from './contactLead.model.js';
import { normalizePhoneE164 } from '../../utils/phone.js';
import { logger } from '../../services/logger.service.js';

export class ContactService {
  /**
   * Submits a landing-page contact inquiry to the LeadNivesh founder/team.
   * Includes bot honeypot detection and IP hashing.
   */
  static async submitContactLead(
    data: {
      name: string;
      email?: string;
      phone: string;
      message: string;
      city?: string;
      agencyName?: string;
      website?: string;
    },
    ipAddress: string
  ): Promise<{ success: boolean; id?: string }> {
    // 1. Honeypot check: If bot filled the hidden "website" field, silently drop
    if (data.website && data.website.trim() !== '') {
      logger.warn('Spam contact lead dropped via honeypot trap', { ip: ipAddress });
      return { success: true }; // Fake success response to bot
    }

    // 2. Normalize phone
    const phoneE164 = normalizePhoneE164(data.phone);

    // 3. Hash IP address for privacy
    const ipHash = crypto.createHash('sha256').update(ipAddress).digest('hex');

    // 4. Save contact lead
    const lead = await ContactLead.create({
      name: data.name.trim(),
      email: data.email ? data.email.trim().toLowerCase() : undefined,
      phone: data.phone.trim(),
      phoneE164,
      message: data.message.trim(),
      city: data.city?.trim() || 'Panipat',
      agencyName: data.agencyName?.trim(),
      ipHash,
    });

    return {
      success: true,
      id: lead._id.toString(),
    };
  }

  /**
   * List contact leads (Admin only).
   */
  static async listContactLeads(query: { page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = Math.min(50, query.limit || 20);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      ContactLead.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ContactLead.countDocuments(),
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

