import crypto from 'node:crypto';
import { User, type IUser } from './user.model.js';
import { Property } from '../properties/property.model.js';
import { Buyer } from '../buyers/buyer.model.js';
import { Deal } from '../deals/deal.model.js';
import { ShareLink } from '../shares/shareLink.model.js';
import { MediaService } from '../../services/media.service.js';
import { getPlanLimits, isPlanExpired } from '../../config/plans.js';

export class UserService {
  static async getMe(userId: string) {
    const user = await User.findOne({ _id: userId, isDeleted: false });
    if (!user) {
      const err: any = new Error('User not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (user.isDisabled) {
      const err: any = new Error('This account has been disabled. Please contact support.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const limits = getPlanLimits(user.plan.tier);
    const expired = isPlanExpired(user.plan);

    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      agency: user.agency,
      preferences: user.preferences,
      plan: {
        tier: user.plan.tier,
        trialEndsAt: user.plan.trialEndsAt,
        expiresAt: user.plan.expiresAt,
        isExpired: expired,
        limits,
      },
      consent: user.consent,
      emailVerified: Boolean(user.emailVerified),
      hasPassword: user.hasPassword !== false,
      authProviders: Array.isArray(user.authProviders) ? user.authProviders : ['password'],
      hasGoogleLinked: Boolean(user.googleId),
      lastLoginAt: user.lastLoginAt,
      lastLoginMethod: user.lastLoginMethod,
      createdAt: user.createdAt,
    };
  }

  static async updateMe(
    userId: string,
    data: {
      name?: string;
      phone?: string;
      agency?: Partial<IUser['agency']>;
      preferences?: Partial<IUser['preferences']>;
    }
  ) {
    const user = await User.findOne({ _id: userId, isDeleted: false });
    if (!user) {
      const err: any = new Error('User not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (user.isDisabled) {
      const err: any = new Error('This account has been disabled. Please contact support.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (data.name) user.name = data.name;
    if (data.phone) user.phone = data.phone;
    if (data.agency) {
      user.agency = { ...user.agency, ...data.agency };
    }
    if (data.preferences) {
      user.preferences = { ...user.preferences, ...data.preferences };
    }

    await user.save();
    return this.getMe(userId);
  }

  static async exportUserData(userId: string) {
    const user = await User.findOne({ _id: userId, isDeleted: false });
    if (!user) {
      const err: any = new Error('User not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const [properties, buyers, deals] = await Promise.all([
      Property.find({ userId, isDeleted: false }).lean(),
      Buyer.find({ userId, isDeleted: false }).lean(),
      Deal.find({ userId, isDeleted: false }).lean(),
    ]);

    // Data export bundle conforming to DPDP / GDPR requirements
    // Never exports password hashes or refresh token hashes
    return {
      account: {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt,
        consent: user.consent,
      },
      agency: user.agency,
      preferences: user.preferences,
      plan: user.plan,
      sessions: user.sessions.map((s) => ({
        sessionId: s.sessionId,
        deviceLabel: s.deviceLabel,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
      })),
      properties,
      buyers,
      deals,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Account Deletion with soft-delete cascade across all owned resources.
   */
  static async deleteAccount(userId: string, confirmText: string) {
    if (confirmText !== 'DELETE MY ACCOUNT') {
      const err: any = new Error('Confirmation text mismatch. You must type "DELETE MY ACCOUNT" exactly.');
      err.statusCode = 400;
      err.code = 'CONFIRM_TEXT_MISMATCH';
      throw err;
    }

    const user = await User.findOne({ _id: userId, isDeleted: false });
    if (!user) {
      const err: any = new Error('User not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const deletedAt = new Date();
    const tombstoneHash = crypto
      .createHash('sha256')
      .update(user.email + '_' + deletedAt.getTime())
      .digest('hex')
      .slice(0, 16);

    // 1. Soft-delete user & immediately anonymize PII (freeing original email for re-registration)
    user.email = `deleted_${tombstoneHash}@deleted.local`;
    user.name = 'Deleted User';
    user.phone = '+910000000000';
    user.agency = { name: 'Deleted Agency', city: 'Panipat' };
    user.pushSubscriptions = [];
    user.isDeleted = true;
    user.deletedAt = deletedAt;
    user.sessions = [];
    await user.save();

    // 2. Cascade soft-delete & immediately anonymize PII across all user resources
    const userProperties = await Property.find({ userId, isDeleted: false }).select('+owner photos');
    for (const prop of userProperties) {
      if (Array.isArray(prop.photos)) {
        for (const photo of prop.photos) {
          if (photo.publicId) {
            await MediaService.deleteAsset(photo.publicId);
          }
        }
      }
    }

    await Promise.all([
      Property.updateMany(
        { userId, isDeleted: false },
        {
          $set: {
            isDeleted: true,
            deletedAt,
            description: '',
            owner: { name: 'Anonymized', phone: '+910000000000', notes: '' },
            landmark: '',
          },
        }
      ),
      Buyer.updateMany(
        { userId, isDeleted: false },
        {
          $set: {
            isDeleted: true,
            deletedAt,
            name: 'Anonymized Buyer',
            phoneE164: '+910000000000',
            notes: '',
            rawText: '',
          },
        }
      ),
      Deal.updateMany(
        { userId, isDeleted: false },
        {
          $set: {
            isDeleted: true,
            deletedAt,
            propertyTitleSnapshot: 'Anonymized Deal',
            notes: '',
          },
        }
      ),
      ShareLink.updateMany(
        { userId, isRevoked: false },
        {
          $set: {
            isRevoked: true,
            revokedAt: deletedAt,
          },
        }
      ),
    ]);

    return { message: 'Account and associated resources deleted successfully' };
  }
}
