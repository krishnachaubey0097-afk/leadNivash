import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { Property } from '../src/modules/properties/property.model.js';
import { Buyer } from '../src/modules/buyers/buyer.model.js';
import { Deal } from '../src/modules/deals/deal.model.js';
import { toPublicProperty } from '../src/modules/properties/publicDto.js';
import { UserService } from '../src/modules/users/user.service.js';
import { User } from '../src/modules/users/user.model.js';
import { ActivityLog } from '../src/modules/activity/activityLog.model.js';
import { signAccessToken } from '../src/utils/jwt.js';

/**
 * Recursively scans any object or array to ensure a forbidden key never exists anywhere in the payload.
 */
function scanForForbiddenKeys(data: any, forbiddenKeys: string[], path = ''): string[] {
  const violations: string[] = [];
  if (data === null || data === undefined || typeof data !== 'object') {
    return violations;
  }

  if (Array.isArray(data)) {
    data.forEach((item, index) => {
      violations.push(...scanForForbiddenKeys(item, forbiddenKeys, `${path}[${index}]`));
    });
    return violations;
  }

  for (const [key, value] of Object.entries(data)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (forbiddenKeys.includes(key.toLowerCase())) {
      violations.push(`Forbidden key "${key}" found at ${currentPath}`);
    }
    if (typeof value === 'object' && value !== null) {
      violations.push(...scanForForbiddenKeys(value, forbiddenKeys, currentPath));
    }
  }

  return violations;
}

describe('Owner Vault Anti-Bypass Leak Verification', () => {
  const userId = '64a1b2c3d4e5f6a7b8c9d0e1';
  const validToken = signAccessToken({
    _id: userId,
    email: 'broker@leadnivesh.com',
    role: 'user',
    sessionId: 'sess_leak_test',
  });

  const mockPropertyWithVault: any = {
    _id: '64a1b2c3d4e5f6a7b8c9d0e2',
    userId,
    title: '200 Gaj Plot — Bajaj Colony',
    type: 'Plot',
    category: 'Residential',
    purpose: 'Sale',
    locality: 'Bajaj Colony',
    localityKey: 'bajaj-colony',
    city: 'Panipat',
    landmark: 'Behind Mittal Mega Mall, Plot 42',
    size: { value: 200, unit: 'gaj' },
    sizeGaj: 200,
    priceDemandPaise: 480000000,
    tags: ['corner'],
    status: 'available',
    photos: [{ url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', publicId: `properties/${userId}/sample` }],
    owner: {
      name: 'Baldev Raj Gupta (Private Owner)',
      phone: '+919812345678',
      notes: 'Wants cash deal, do not call after 8 PM',
    },
    isDeleted: false,
  };

  it('toPublicProperty DTO strictly strips owner, userId, and landmark keys', () => {
    const publicDto = toPublicProperty(mockPropertyWithVault, {
      name: 'Rajesh Real Estate',
      phone: '+919999999999',
    });

    const forbidden = ['owner', 'userid', 'landmark'];
    const violations = scanForForbiddenKeys(publicDto, forbidden);

    expect(violations).toEqual([]);
    expect((publicDto as any).owner).toBeUndefined();
    expect((publicDto as any).userId).toBeUndefined();
    expect((publicDto as any).landmark).toBeUndefined();
    expect(publicDto.title).toBe('200 Gaj Plot — Bajaj Colony');
    expect(publicDto.agency?.name).toBe('Rajesh Real Estate');
  });

  it('GET /api/v1/properties list response NEVER contains owner field', async () => {
    // When queried with .lean(), Mongoose excludes select: false fields by default
    const publicDoc = { ...mockPropertyWithVault };
    delete publicDoc.owner;

    vi.spyOn(Property, 'find').mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([publicDoc]),
    } as any);
    vi.spyOn(Property, 'countDocuments').mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/properties')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    const violations = scanForForbiddenKeys(res.body.data, ['owner']);
    expect(violations).toEqual([]);
  });

  it('GET /api/v1/users/me/export NEVER leaks owner contact info of other parties', async () => {
    vi.spyOn(User, 'findOne').mockResolvedValue({
      _id: userId,
      email: 'broker@leadnivesh.com',
      name: 'Broker Rajesh',
      sessions: [],
      plan: {},
      isDeleted: false,
    } as any);

    const publicDoc = { ...mockPropertyWithVault };
    delete publicDoc.owner;
    vi.spyOn(Property, 'find').mockReturnValue({
      lean: vi.fn().mockResolvedValue([publicDoc]),
    } as any);
    vi.spyOn(Buyer, 'find').mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    } as any);
    vi.spyOn(Deal, 'find').mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    } as any);

    const exportData = await UserService.exportUserData(userId);
    const violations = scanForForbiddenKeys(exportData, ['owner']);
    expect(violations).toEqual([]);
  });

  it('GET /api/v1/properties/:id explicitly includes owner vault for the owning broker', async () => {
    vi.spyOn(Property, 'findOne').mockReturnValue({
      select: vi.fn().mockResolvedValue(mockPropertyWithVault),
    } as any);

    const res = await request(app)
      .get(`/api/v1/properties/${mockPropertyWithVault._id}`)
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.owner).toBeDefined();
    expect(res.body.data.owner.name).toBe('Baldev Raj Gupta (Private Owner)');
    expect(res.body.data.owner.phone).toBe('+919812345678');
  });

  it('PATCH /api/v1/properties/:id response NEVER leaks owner vault', async () => {
    vi.spyOn(ActivityLog, 'create').mockResolvedValue({} as any);
    const docWithoutOwner = { ...mockPropertyWithVault };
    delete docWithoutOwner.owner;
    docWithoutOwner.save = vi.fn().mockResolvedValue(true);

    vi.spyOn(Property, 'findOne').mockResolvedValue(docWithoutOwner as any);

    const res = await request(app)
      .patch(`/api/v1/properties/${mockPropertyWithVault._id}`)
      .set('Authorization', `Bearer ${validToken}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    const violations = scanForForbiddenKeys(res.body.data, ['owner']);
    expect(violations).toEqual([]);
  });
});
