import crypto from 'crypto';
import { ShareLink, type IShareLink } from './shareLink.model.js';
import { Property } from '../properties/property.model.js';
import { toPublicProperty, type PublicPropertyDto } from '../properties/publicDto.js';
import { assertOwnership } from '../../utils/ownershipCheck.js';
import { UsageCounter, getCurrentPeriod } from '../usage/usageCounter.model.js';

export class ShareService {
  /**
   * Generates a secure share link for a property (valid for 30 days).
   */
  static async createShareLink(
    userId: string,
    propertyId: string,
    template = 'flyer'
  ): Promise<{ token: string; shareUrl: string; expiresAt: Date }> {
    // Assert user owns the property
    await assertOwnership(Property, propertyId, userId);

    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await ShareLink.create({
      userId,
      propertyId,
      token,
      expiresAt,
      template,
      isRevoked: false,
      viewCount: 0,
    });

    const period = getCurrentPeriod();
    await UsageCounter.findOneAndUpdate(
      { userId, period },
      { $inc: { shares: 1 } },
      { upsert: true, returnDocument: 'after' }
    );

    return {
      token,
      shareUrl: `/p/${token}`,
      expiresAt,
    };
  }

  /**
   * Revokes a share link.
   */
  static async revokeShareLink(userId: string, shareId: string): Promise<void> {
    const share = await assertOwnership(ShareLink, shareId, userId);
    share.isRevoked = true;
    share.revokedAt = new Date();
    await share.save();
  }

  /**
   * Resolves a public share token.
   * Differentiates between 404 (non-existent token) and 410 (expired, revoked, or trashed listing).
   */
  static async resolvePublicShare(
    token: string
  ): Promise<
    | { status: 200; property: PublicPropertyDto; share: IShareLink }
    | { status: 410 }
    | { status: 404 }
  > {
    if (!token || typeof token !== 'string') return { status: 404 };

    const share = await ShareLink.findOne({ token });
    if (!share) return { status: 404 };

    // If revoked or expired, return 410 Gone
    if (share.isRevoked || share.expiresAt <= new Date()) {
      return { status: 410 };
    }

    const prop = await Property.findOne({
      _id: share.propertyId,
    });

    // If property doesn't exist or is trashed, return 410 Gone
    if (!prop || prop.isDeleted) {
      return { status: 410 };
    }

    // Increment view count asynchronously
    ShareLink.updateOne({ _id: share._id }, { $inc: { viewCount: 1 }, $set: { lastViewedAt: new Date() } }).exec();

    return {
      status: 200,
      property: toPublicProperty(prop),
      share,
    };
  }

  /**
   * Resolves a public share token (compatibility helper).
   */
  static async getPublicPropertyByToken(
    token: string
  ): Promise<{ property: PublicPropertyDto; share: IShareLink } | null> {
    const res = await this.resolvePublicShare(token);
    if (res.status === 200) {
      return { property: res.property, share: res.share };
    }
    return null;
  }
}
