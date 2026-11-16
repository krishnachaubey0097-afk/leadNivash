import { Property } from '../properties/property.model.js';
import { Buyer } from '../buyers/buyer.model.js';
import { Deal } from '../deals/deal.model.js';
import { User } from '../users/user.model.js';
import { ShareLink } from '../shares/shareLink.model.js';
import { MediaService } from '../../services/media.service.js';

export interface TrashedItemDTO {
  type: 'property' | 'buyer' | 'deal';
  id: string;
  title: string;
  deletedAt: Date;
  daysLeft: number;
}

export class TrashService {
  /**
   * List all soft-deleted items across properties, buyers, and deals.
   * Computes daysLeft until automatic purge (30-day window).
   */
  static async listTrash(userId: string): Promise<TrashedItemDTO[]> {
    const now = Date.now();
    const MS_PER_DAY = 86400000;

    const [properties, buyers, deals] = await Promise.all([
      Property.find({ userId, isDeleted: true }).sort({ deletedAt: -1 }).lean(),
      Buyer.find({ userId, isDeleted: true }).sort({ deletedAt: -1 }).lean(),
      Deal.find({ userId, isDeleted: true }).sort({ deletedAt: -1 }).lean(),
    ]);

    const items: TrashedItemDTO[] = [];

    for (const p of properties) {
      const deletedAt = p.deletedAt || new Date();
      const ageMs = now - new Date(deletedAt).getTime();
      const daysLeft = Math.max(0, 30 - Math.floor(ageMs / MS_PER_DAY));
      items.push({
        type: 'property',
        id: p._id.toString(),
        title: p.title || 'Untitled Property',
        deletedAt: new Date(deletedAt),
        daysLeft,
      });
    }

    for (const b of buyers) {
      const deletedAt = b.deletedAt || new Date();
      const ageMs = now - new Date(deletedAt).getTime();
      const daysLeft = Math.max(0, 30 - Math.floor(ageMs / MS_PER_DAY));
      items.push({
        type: 'buyer',
        id: b._id.toString(),
        title: b.name || 'Unnamed Buyer',
        deletedAt: new Date(deletedAt),
        daysLeft,
      });
    }

    for (const d of deals) {
      const deletedAt = d.deletedAt || new Date();
      const ageMs = now - new Date(deletedAt).getTime();
      const daysLeft = Math.max(0, 30 - Math.floor(ageMs / MS_PER_DAY));
      items.push({
        type: 'deal',
        id: d._id.toString(),
        title: d.propertyTitleSnapshot ? `Deal: ${d.propertyTitleSnapshot}` : 'Deal',
        deletedAt: new Date(deletedAt),
        daysLeft,
      });
    }

    // Sort descending by deletedAt
    items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
    return items;
  }

  /**
   * Restore a soft-deleted item.
   * Checks plan limits before restoring (returns 402 PLAN_LIMIT_REACHED if exceeded).
   * Restored share links return 410 and are NOT reactivated.
   */
  static async restore(
    userId: string,
    type: 'property' | 'buyer' | 'deal',
    id: string
  ): Promise<{ message: string; id: string; type: string }> {
    const user = await User.findById(userId);
    if (!user || user.isDeleted || user.isDisabled) {
      const err: any = new Error('User not found or account inactive');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (type === 'property') {
      const activeCount = await Property.countDocuments({ userId, isDeleted: false });
      if (activeCount >= (user.plan?.limits?.maxListings ?? 50)) {
        const err: any = new Error('Plan limit reached. Upgrade your plan to restore more listings.');
        err.statusCode = 402;
        err.code = 'PLAN_LIMIT_REACHED';
        throw err;
      }

      const prop = await Property.findOne({ _id: id, userId, isDeleted: true });
      if (!prop) {
        const err: any = new Error('Property not found in trash');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      prop.isDeleted = false;
      prop.deletedAt = undefined;
      await prop.save();

      // Ensure share links remain revoked (they return 410 and are NOT reactivated)
      await ShareLink.updateMany(
        { propertyId: id },
        { $set: { isRevoked: true } }
      );

      return { message: 'Property restored successfully', id, type };
    }

    if (type === 'buyer') {
      const activeCount = await Buyer.countDocuments({ userId, isDeleted: false });
      if (activeCount >= (user.plan?.limits?.maxBuyers ?? 100)) {
        const err: any = new Error('Plan limit reached. Upgrade your plan to restore more buyers.');
        err.statusCode = 402;
        err.code = 'PLAN_LIMIT_REACHED';
        throw err;
      }

      const buyer = await Buyer.findOne({ _id: id, userId, isDeleted: true });
      if (!buyer) {
        const err: any = new Error('Buyer not found in trash');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      buyer.isDeleted = false;
      buyer.deletedAt = undefined;
      await buyer.save();

      return { message: 'Buyer restored successfully', id, type };
    }

    if (type === 'deal') {
      const deal = await Deal.findOne({ _id: id, userId, isDeleted: true });
      if (!deal) {
        const err: any = new Error('Deal not found in trash');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      deal.isDeleted = false;
      deal.deletedAt = undefined;
      await deal.save();

      return { message: 'Deal restored successfully', id, type };
    }

    const err: any = new Error('Invalid trash item type');
    err.statusCode = 400;
    err.code = 'BAD_REQUEST';
    throw err;
  }

  /**
   * Permanently delete an item from trash.
   * Requires confirmText "PERMANENT DELETE".
   * For properties: deletes Cloudinary photos first, then DB document.
   */
  static async permanentDelete(
    userId: string,
    type: 'property' | 'buyer' | 'deal',
    id: string
  ): Promise<{ message: string }> {
    if (type === 'property') {
      const prop = await Property.findOne({ _id: id, userId, isDeleted: true });
      if (!prop) {
        const err: any = new Error('Property not found in trash');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      // Delete Cloudinary photos first
      if (Array.isArray(prop.photos)) {
        for (const photo of prop.photos) {
          if (photo?.publicId) {
            await MediaService.deleteAsset(photo.publicId);
          }
        }
      }

      // Clean up any share links
      await ShareLink.deleteMany({ propertyId: id });

      // Delete MongoDB document
      await Property.deleteOne({ _id: id });
      return { message: 'Property permanently deleted' };
    }

    if (type === 'buyer') {
      const buyer = await Buyer.findOne({ _id: id, userId, isDeleted: true });
      if (!buyer) {
        const err: any = new Error('Buyer not found in trash');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      await Buyer.deleteOne({ _id: id });
      return { message: 'Buyer permanently deleted' };
    }

    if (type === 'deal') {
      const deal = await Deal.findOne({ _id: id, userId, isDeleted: true });
      if (!deal) {
        const err: any = new Error('Deal not found in trash');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      await Deal.deleteOne({ _id: id });
      return { message: 'Deal permanently deleted' };
    }

    const err: any = new Error('Invalid trash item type');
    err.statusCode = 400;
    err.code = 'BAD_REQUEST';
    throw err;
  }
}
