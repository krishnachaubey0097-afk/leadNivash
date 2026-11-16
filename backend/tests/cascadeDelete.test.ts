import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '../src/modules/users/user.service.js';
import { User } from '../src/modules/users/user.model.js';
import { Property } from '../src/modules/properties/property.model.js';
import { Buyer } from '../src/modules/buyers/buyer.model.js';
import { Deal } from '../src/modules/deals/deal.model.js';
import { ShareLink } from '../src/modules/shares/shareLink.model.js';
import { MediaService } from '../src/services/media.service.js';

describe('Account Deletion Soft-Delete Cascade', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('cascades soft-delete to properties, buyers, and deals upon user deletion', async () => {
    const userId = '64a1b2c3d4e5f6a7b8c9d0e1';

    const mockUser: any = {
      _id: userId,
      email: 'broker@leadnivesh.com',
      name: 'Broker Name',
      phone: '+919876543210',
      pushSubscriptions: [{ endpoint: 'https://push.example.com' }],
      isDeleted: false,
      sessions: ['s1', 's2'],
      save: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(User, 'findOne').mockResolvedValue(mockUser);
    vi.spyOn(Property, 'find').mockReturnValue({
      select: vi.fn().mockResolvedValue([
        { photos: [{ publicId: `properties/${userId}/p1` }] },
      ]),
    } as any);
    const mediaSpy = vi.spyOn(MediaService, 'deleteAsset').mockResolvedValue(true);
    const propUpdateSpy = vi.spyOn(Property, 'updateMany').mockResolvedValue({ modifiedCount: 3 } as any);
    const buyerUpdateSpy = vi.spyOn(Buyer, 'updateMany').mockResolvedValue({ modifiedCount: 5 } as any);
    const dealUpdateSpy = vi.spyOn(Deal, 'updateMany').mockResolvedValue({ modifiedCount: 2 } as any);
    const shareUpdateSpy = vi.spyOn(ShareLink, 'updateMany').mockResolvedValue({ modifiedCount: 1 } as any);

    const result = await UserService.deleteAccount(userId, 'DELETE MY ACCOUNT');

    expect(result.message).toContain('Account and associated resources deleted successfully');
    expect(mockUser.isDeleted).toBe(true);
    expect(mockUser.sessions).toEqual([]);
    expect(mockUser.pushSubscriptions).toEqual([]);
    expect(mockUser.email).toMatch(/^deleted_[a-f0-9]+@deleted\.local$/);
    expect(mockUser.name).toBe('Deleted User');
    expect(mockUser.phone).toBe('+910000000000');
    expect(mediaSpy).toHaveBeenCalledWith(`properties/${userId}/p1`);
    expect(shareUpdateSpy).toHaveBeenCalledWith(
      { userId, isRevoked: false },
      expect.objectContaining({ $set: expect.objectContaining({ isRevoked: true }) })
    );

    expect(propUpdateSpy).toHaveBeenCalledWith(
      { userId, isDeleted: false },
      expect.objectContaining({ $set: expect.objectContaining({ isDeleted: true }) })
    );

    expect(buyerUpdateSpy).toHaveBeenCalledWith(
      { userId, isDeleted: false },
      expect.objectContaining({ $set: expect.objectContaining({ isDeleted: true }) })
    );

    expect(dealUpdateSpy).toHaveBeenCalledWith(
      { userId, isDeleted: false },
      expect.objectContaining({ $set: expect.objectContaining({ isDeleted: true }) })
    );
  });
});

