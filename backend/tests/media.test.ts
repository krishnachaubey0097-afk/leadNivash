import { describe, it, expect } from 'vitest';
import { MediaService } from '../src/services/media.service.js';

describe('Media Upload Service & Cloudinary Security', () => {
  const userId = '64a1b2c3d4e5f6a7b8c9d0e1';

  it('generates signed upload params constrained strictly to the user folder', () => {
    const params = MediaService.getSignedUploadParams(userId);

    expect(params.folder).toBe(`properties/${userId}`);
    expect(params.signature).toBeDefined();
    expect(params.timestamp).toBeGreaterThan(0);
    expect(params.uploadUrl).toContain('cloudinary.com');
  });

  it('validateUserFolder validates legitimate user publicIds', () => {
    const validPublicId = `properties/${userId}/photo_front_view`;
    expect(MediaService.validateUserFolder(validPublicId, userId)).toBe(true);
  });

  it('validateUserFolder strictly blocks cross-user publicIds or folder spoofing', () => {
    const maliciousOtherUser = 'properties/other_user_64a1b2/photo';
    const rootInjection = 'properties/photo_at_root';
    const traversal = `properties/${userId}/../../admin_assets/secret`;

    expect(MediaService.validateUserFolder(maliciousOtherUser, userId)).toBe(false);
    expect(MediaService.validateUserFolder(rootInjection, userId)).toBe(false);
    expect(MediaService.validateUserFolder(traversal, userId)).toBe(false);
    expect(MediaService.validateUserFolder('', userId)).toBe(false);
  });
});
