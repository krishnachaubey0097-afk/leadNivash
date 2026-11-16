import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { Property } from '../src/modules/properties/property.model.js';
import { Buyer } from '../src/modules/buyers/buyer.model.js';
import { Deal } from '../src/modules/deals/deal.model.js';
import { ShareLink } from '../src/modules/shares/shareLink.model.js';
import { MediaService } from '../src/services/media.service.js';
import { signAccessToken } from '../src/utils/jwt.js';

describe('Trash Vault API Integration (/api/v1/trash)', () => {
  let replSet: MongoMemoryReplSet;
  let user: any;
  let token: string;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    const uri = replSet.getUri();
    await mongoose.connect(uri);
  }, 180000);

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (replSet) {
      await replSet.stop();
    }
  }, 30000);

  beforeEach(async () => {
    await User.deleteMany({});
    await Property.deleteMany({});
    await Buyer.deleteMany({});
    await Deal.deleteMany({});
    await ShareLink.deleteMany({});

    user = await User.create({
      name: 'Trash Tester',
      email: 'trash@example.com',
      passwordHash: 'hashed_pw',
      phone: '+919876543210',
      consent: { termsAcceptedAt: new Date(), privacyVersion: '1.0' },
      plan: {
        tier: 'trial',
        trialEndsAt: new Date(Date.now() + 14 * 86400000),
        limits: {
          maxListings: 10,
          maxBuyers: 10,
          maxParsesMonthly: 50,
          maxPhotosPerListing: 4,
          flyerBranding: false,
          supportLevel: 'standard',
        },
      },
    });

    token = signAccessToken({
      _id: user._id.toString(),
      email: user.email,
      role: 'user',
      sessionId: 'session_trash_test',
    });
  });

  it('lists soft-deleted items across properties, buyers, and deals with daysLeft', async () => {
    const prop = await Property.create({
      userId: user._id,
      title: 'Trashed 200 Gaj Plot in Sector 12',
      type: 'Plot',
      category: 'Residential',
      purpose: 'Sale',
      locality: 'Sector 12',
      localityKey: 'sector 12',
      city: 'Panipat',
      priceDemandPaise: 850000000,
      size: { value: 200, unit: 'gaj' },
      sizeGaj: 200,
      isDeleted: true,
      deletedAt: new Date(Date.now() - 2 * 86400000), // 2 days ago
    });

    const buyer = await Buyer.create({
      userId: user._id,
      name: 'Trashed Buyer Ramesh',
      phoneE164: '+919812345678',
      budget: { maxPaise: 1000000000 },
      types: ['Plot'],
      localities: [{ display: 'Sector 12', key: 'sector 12' }],
      anyLocality: false,
      purpose: 'Sale',
      urgency: 'hot',
      status: 'active',
      source: 'manual',
      isDeleted: true,
      deletedAt: new Date(Date.now() - 5 * 86400000), // 5 days ago
    });

    await Deal.create({
      userId: user._id,
      buyerId: buyer._id,
      propertyId: prop._id,
      propertyTitleSnapshot: 'Trashed 200 Gaj Plot',
      valuePaise: 800000000,
      commission: { mode: 'percent', bps: 100, expectedPaise: 800000 },
      stage: 'interested',
      isDeleted: true,
      deletedAt: new Date(),
    });

    const res = await request(app)
      .get('/api/v1/trash')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(3);

    const propItem = res.body.data.find((i: any) => i.type === 'property');
    expect(propItem).toBeDefined();
    expect(propItem.title).toBe('Trashed 200 Gaj Plot in Sector 12');
    expect(propItem.daysLeft).toBe(28); // 30 - 2

    const buyerItem = res.body.data.find((i: any) => i.type === 'buyer');
    expect(buyerItem).toBeDefined();
    expect(buyerItem.daysLeft).toBe(25); // 30 - 5

    // Trashed items do NOT appear in standard active listings
    const activePropsRes = await request(app)
      .get('/api/v1/properties')
      .set('Authorization', `Bearer ${token}`);
    expect(activePropsRes.body.data.length).toBe(0);
  });

  it('restores a soft-deleted property and verifies share links remain 410', async () => {
    const prop = await Property.create({
      userId: user._id,
      title: 'Restorable Property',
      type: 'Plot',
      category: 'Residential',
      purpose: 'Sale',
      locality: 'Ansals',
      localityKey: 'ansals',
      city: 'Panipat',
      priceDemandPaise: 500000000,
      size: { value: 150, unit: 'gaj' },
      sizeGaj: 150,
      isDeleted: true,
      deletedAt: new Date(),
    });

    // Create a share link that was revoked when property was deleted
    const share = await ShareLink.create({
      userId: user._id,
      propertyId: prop._id,
      token: 'restored_prop_share_token',
      expiresAt: new Date(Date.now() + 10 * 86400000),
      isRevoked: true,
      template: 'flyer',
    });

    const restoreRes = await request(app)
      .post(`/api/v1/trash/property/${prop._id}/restore`)
      .set('Authorization', `Bearer ${token}`);

    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.success).toBe(true);

    const updatedProp = await Property.findById(prop._id);
    expect(updatedProp?.isDeleted).toBe(false);
    expect(updatedProp?.deletedAt).toBeUndefined();

    // Verify share link remains revoked and public flyer returns 410 (NOT reactivated)
    const updatedShare = await ShareLink.findById(share._id);
    expect(updatedShare?.isRevoked).toBe(true);

    const flyerRes = await request(app).get(`/p/${share.token}`);
    expect(flyerRes.status).toBe(410);
  });

  it('blocks restore with 402 PLAN_LIMIT_REACHED if user exceeds plan limit', async () => {
    // Restrict plan limit to 1 listing
    user.plan.limits = {
      maxListings: 1,
      maxBuyers: 1,
      maxParsesMonthly: 10,
      maxPhotosPerListing: 4,
      flyerBranding: false,
      supportLevel: 'standard',
    };
    user.markModified('plan');
    await user.save();

    // Create 1 active property
    await Property.create({
      userId: user._id,
      title: 'Active Property 1',
      type: 'Plot',
      category: 'Residential',
      purpose: 'Sale',
      locality: 'Model Town',
      localityKey: 'model town',
      city: 'Panipat',
      priceDemandPaise: 600000000,
      size: { value: 100, unit: 'gaj' },
      sizeGaj: 100,
      isDeleted: false,
    });

    // Trashed property
    const trashedProp = await Property.create({
      userId: user._id,
      title: 'Trashed Property to Restore',
      type: 'Plot',
      category: 'Residential',
      purpose: 'Sale',
      locality: 'Model Town',
      localityKey: 'model town',
      city: 'Panipat',
      priceDemandPaise: 700000000,
      size: { value: 120, unit: 'gaj' },
      sizeGaj: 120,
      isDeleted: true,
      deletedAt: new Date(),
    });

    const restoreRes = await request(app)
      .post(`/api/v1/trash/property/${trashedProp._id}/restore`)
      .set('Authorization', `Bearer ${token}`);

    expect(restoreRes.status).toBe(402);
    expect(restoreRes.body.error.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('permanently deletes property: requires confirm text and deletes Cloudinary photos', async () => {
    const deleteSpy = vi.spyOn(MediaService, 'deleteAsset').mockResolvedValue(true);

    const prop = await Property.create({
      userId: user._id,
      title: 'Property for Permanent Delete',
      type: 'Plot',
      category: 'Residential',
      purpose: 'Sale',
      locality: 'Sukhdev Nagar',
      localityKey: 'sukhdev nagar',
      city: 'Panipat',
      priceDemandPaise: 400000000,
      size: { value: 100, unit: 'gaj' },
      sizeGaj: 100,
      photos: [
        {
          url: 'https://res.cloudinary.com/test/photo1.jpg',
          publicId: `properties/${user._id}/photo1`,
          width: 800,
          height: 600,
        },
      ],
      isDeleted: true,
      deletedAt: new Date(),
    });

    // Without exact confirmation text -> 400
    const failRes = await request(app)
      .delete(`/api/v1/trash/property/${prop._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmText: 'delete' });
    expect(failRes.status).toBe(400);

    // With exact "PERMANENT DELETE" -> 200
    const successRes = await request(app)
      .delete(`/api/v1/trash/property/${prop._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmText: 'PERMANENT DELETE' });

    expect(successRes.status).toBe(200);
    expect(deleteSpy).toHaveBeenCalledWith(`properties/${user._id}/photo1`);

    // Fully purged from MongoDB
    const checkDb = await Property.findById(prop._id);
    expect(checkDb).toBeNull();

    deleteSpy.mockRestore();
  });
});
