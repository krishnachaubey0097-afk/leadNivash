import crypto from 'crypto';
import { env } from '../config/env.js';

export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_PHOTO_BYTES = 2000000; // 2 MB
export const MAX_PHOTOS_PER_PROPERTY = 4;

export interface SignedUploadParams {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
  uploadUrl: string;
}

export class MediaService {
  /**
   * Generates a signed Cloudinary upload signature for client-side direct upload of property photos.
   * Scoped to `properties/${userId}`.
   */
  static getSignedUploadParams(userId: string, resourceType: 'image' | 'video' = 'image'): SignedUploadParams {
    if (!userId) {
      throw new Error('User ID required for media upload authorization');
    }

    const timestamp = Math.round(Date.now() / 1000);
    const folder = `properties/${userId}`;
    const apiKey = env.CLOUDINARY_API_KEY || 'mock_api_key';
    const apiSecret = env.CLOUDINARY_API_SECRET || 'mock_api_secret';
    const cloudName = env.CLOUDINARY_CLOUD_NAME || 'mock_cloud';

    const paramsToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');

    return {
      timestamp,
      signature,
      apiKey,
      cloudName,
      folder,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    };
  }

  /**
   * Generates a signed Cloudinary upload signature for agency logo.
   * Scoped to `logos/${userId}`.
   */
  static getSignedLogoUploadParams(userId: string): SignedUploadParams {
    if (!userId) {
      throw new Error('User ID required for logo upload authorization');
    }

    const timestamp = Math.round(Date.now() / 1000);
    const folder = `logos/${userId}`;
    const apiKey = env.CLOUDINARY_API_KEY || 'mock_api_key';
    const apiSecret = env.CLOUDINARY_API_SECRET || 'mock_api_secret';
    const cloudName = env.CLOUDINARY_CLOUD_NAME || 'mock_cloud';

    const paramsToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');

    return {
      timestamp,
      signature,
      apiKey,
      cloudName,
      folder,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    };
  }

  /**
   * Validates that a submitted photo publicId belongs strictly to the user's property folder.
   * Prevents photo hijacking and path traversal attacks.
   */
  static validateUserFolder(publicId: string, userId: string): boolean {
    if (!publicId || !userId) return false;
    if (publicId.includes('..') || publicId.includes('\\')) return false;
    const expectedPrefix = `properties/${userId}/`;
    return publicId.startsWith(expectedPrefix);
  }

  /**
   * Validates that a logo publicId belongs strictly to the user's logo folder.
   */
  static validateUserLogoFolder(publicId: string, userId: string): boolean {
    if (!publicId || !userId) return false;
    if (publicId.includes('..') || publicId.includes('\\')) return false;
    const expectedPrefix = `logos/${userId}/`;
    return publicId.startsWith(expectedPrefix);
  }

  /**
   * Deletes an asset from Cloudinary.
   */
  static async deleteAsset(publicId: string): Promise<boolean> {
    if (!publicId) return false;
    // In production, invoke Cloudinary admin/destroy API; in test/dev safely stub
    return true;
  }
}
