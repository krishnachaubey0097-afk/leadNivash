import { Property, type IProperty, type PropertyStatus } from './property.model.js';
import { assertOwnership } from '../../utils/ownershipCheck.js';
import { convertToGaj, type SupportedUnit } from '../../utils/units.js';
import { MediaService } from '../../services/media.service.js';
import { Matcher } from '../matches/matcher.js';
import { ActivityLog } from '../activity/activityLog.model.js';
import { normalizePhoneE164 } from '../../utils/phone.js';

export function escapeSearchRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class PropertyService {
  /**
   * Create a new property listing with auto-title and canonical Gaj computation.
   */
  static async create(
    userId: string,
    data: any,
    marlaToGaj = 30.25
  ): Promise<{ property: IProperty; reverseMatchCount: number }> {
    // 1. Calculate canonical sizeGaj server-side
    const unitConv = convertToGaj(data.size.value, data.size.unit as SupportedUnit, marlaToGaj);
    if (unitConv.sizeGaj === null) {
      const err: any = new Error(unitConv.warning || 'Invalid size unit. Please provide size in Gaj directly.');
      err.statusCode = 400;
      err.code = 'INVALID_UNIT';
      throw err;
    }
    const sizeGaj = unitConv.sizeGaj;

    // 2. Auto-generate title if not explicitly provided
    const title =
      data.title && data.title.trim()
        ? data.title.trim()
        : `${data.size.value} ${data.size.unit.toUpperCase()} ${data.type} — ${data.locality}`;

    // 3. Validate photo publicIds (must belong to user folder properties/${userId}/...)
    if (Array.isArray(data.photos)) {
      for (const photo of data.photos) {
        if (!MediaService.validateUserFolder(photo.publicId, userId)) {
          const err: any = new Error(`Photo upload verification failed for ${photo.publicId}: folder mismatch`);
          err.statusCode = 403;
          err.code = 'FORBIDDEN';
          throw err;
        }
      }
    }

    const localityKey = data.locality.toLowerCase().trim().replace(/\s+/g, '-');

    const property = new Property({
      userId,
      title,
      type: data.type,
      category: data.category || 'Residential',
      purpose: data.purpose || 'Sale',
      locality: data.locality.trim(),
      localityKey,
      city: data.city || 'Panipat',
      landmark: data.landmark?.trim(),
      size: data.size,
      sizeGaj,
      priceDemandPaise: data.priceDemandPaise,
      isApproxPrice: Boolean(data.isApproxPrice),
      facing: data.facing?.trim(),
      tags: data.tags || [],
      description: data.description?.trim(),
      status: data.status || 'available',
      photos: data.photos || [],
      owner: data.owner
        ? {
            name: data.owner.name?.trim(),
            phone: data.owner.phone ? normalizePhoneE164(data.owner.phone) : undefined,
            email: data.owner.email?.trim()?.toLowerCase() || undefined,
            notes: data.owner.notes?.trim(),
          }
        : undefined,
      source: data.source || 'manual',
    });

    await property.save();

    // Log real event (no PII)
    await ActivityLog.create({
      userId,
      type: 'property_created',
      entityType: 'property',
      entityId: property._id,
      meta: { type: property.type, locality: property.locality, sizeGaj },
    });

    // Check reverse matches ("N buyers are waiting for this")
    const reverseMatchCount = await Matcher.countReverseMatches(property, userId);

    return { property, reverseMatchCount };
  }

  /**
   * List properties for user with filters & pagination.
   * NEVER returns owner field in list view.
   */
  static async list(
    userId: string,
    query: {
      page?: number;
      limit?: number;
      type?: string;
      status?: string;
      localityKey?: string;
      search?: string;
    }
  ) {
    const page = query.page || 1;
    const limit = Math.min(50, query.limit || 20);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      userId,
      isDeleted: false,
    };

    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;
    if (query.localityKey) filter.localityKey = query.localityKey.toLowerCase().trim();

    if (query.search && query.search.trim()) {
      const escaped = escapeSearchRegex(query.search.trim());
      filter.$or = [
        { title: { $regex: escaped, $options: 'i' } },
        { locality: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      Property.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(), // owner is omitted because select: false is on schema
      Property.countDocuments(filter),
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
   * Detail of a property. Includes Owner Vault ONLY for the owning broker.
   */
  static async getById(userId: string, id: string): Promise<IProperty> {
    const property = await Property.findOne({
      _id: id,
      userId,
      isDeleted: false,
    }).select('+owner'); // Explicitly select private owner vault for owner

    if (!property) {
      const err: any = new Error('Resource not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    return property;
  }

  /**
   * Update property details.
   */
  static async update(
    userId: string,
    id: string,
    data: any,
    marlaToGaj = 30.25
  ): Promise<IProperty> {
    const property = await assertOwnership(Property, id, userId);

    if (data.size) {
      const unitConv = convertToGaj(data.size.value, data.size.unit as SupportedUnit, marlaToGaj);
      if (unitConv.sizeGaj === null) {
        const err: any = new Error(unitConv.warning || 'Invalid size unit');
        err.statusCode = 400;
        err.code = 'INVALID_UNIT';
        throw err;
      }
      property.size = data.size;
      property.sizeGaj = unitConv.sizeGaj;
    }

    if (data.title) property.title = data.title.trim();
    if (data.type) property.type = data.type;
    if (data.category) property.category = data.category;
    if (data.purpose) property.purpose = data.purpose;
    if (data.locality) {
      property.locality = data.locality.trim();
      property.localityKey = data.locality.toLowerCase().trim().replace(/\s+/g, '-');
    }
    if (data.city) property.city = data.city;
    if (data.landmark !== undefined) property.landmark = data.landmark?.trim();
    if (data.priceDemandPaise !== undefined) property.priceDemandPaise = data.priceDemandPaise;
    if (data.facing !== undefined) property.facing = data.facing?.trim();
    if (data.tags) property.tags = data.tags;
    if (data.description !== undefined) property.description = data.description?.trim();
    if (data.photos) {
      for (const photo of data.photos) {
        if (!MediaService.validateUserFolder(photo.publicId, userId)) {
          const err: any = new Error(`Photo upload verification failed for ${photo.publicId}: folder mismatch`);
          err.statusCode = 403;
          err.code = 'FORBIDDEN';
          throw err;
        }
      }
      property.photos = data.photos;
    }
    if (data.owner) {
      property.owner = { ...(property.owner || {}), ...data.owner };
    }

    await property.save();

    await ActivityLog.create({
      userId,
      type: 'property_updated',
      entityType: 'property',
      entityId: property._id,
    });

    return property;
  }

  /**
   * Update status (e.g. hold, sold, available).
   */
  static async updateStatus(userId: string, id: string, status: PropertyStatus): Promise<IProperty> {
    const property = await assertOwnership(Property, id, userId);
    property.status = status;
    await property.save();

    await ActivityLog.create({
      userId,
      type: 'property_status_changed',
      entityType: 'property',
      entityId: property._id,
      meta: { status },
    });

    return property;
  }

  /**
   * Delete a photo from property and Cloudinary with user folder ownership check.
   */
  static async deletePhoto(userId: string, id: string, publicId: string): Promise<IProperty> {
    if (!MediaService.validateUserFolder(publicId, userId)) {
      const err: any = new Error('Forbidden: Photo does not belong to your upload folder');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const property = await assertOwnership(Property, id, userId);
    property.photos = property.photos.filter((p) => p.publicId !== publicId);
    await property.save();

    await MediaService.deleteAsset(publicId);
    return property;
  }

  /**
   * Atomically increment property pitch / sent count when broker copies or shares details.
   */
  static async recordPitch(userId: string, id: string): Promise<{ _id: string; pitchCount: number }> {
    await assertOwnership(Property, id, userId);
    const updated = await Property.findOneAndUpdate(
      { _id: id, userId, isDeleted: false },
      { $inc: { pitchCount: 1 } },
      { returnDocument: 'after' }
    ).select('_id pitchCount');

    if (!updated) {
      const err: any = new Error('Resource not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    await ActivityLog.create({
      userId,
      type: 'share_initiated',
      entityType: 'property',
      entityId: updated._id,
      meta: { pitchCount: updated.pitchCount },
    });

    return {
      _id: updated._id.toString(),
      pitchCount: updated.pitchCount || 1,
    };
  }

  /**
   * Soft delete property.
   */
  static async delete(userId: string, id: string): Promise<void> {
    const property = await assertOwnership(Property, id, userId);
    property.isDeleted = true;
    property.deletedAt = new Date();
    await property.save();
  }
}

