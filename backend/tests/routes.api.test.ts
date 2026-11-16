import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../src/app.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

describe('Mounted HTTP Routes Comprehensive Supertest Suite', () => {
  let replSet: MongoMemoryReplSet;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    const uri = replSet.getUri();
    await mongoose.connect(uri);

    const reg = await AuthService.register({
      name: 'Route Tester',
      email: 'routetester@leadnivesh.com',
      password: 'Password123!',
      phone: '+919876543210',
      consent: { termsAccepted: true, privacyVersion: '1.0' },
    });
    authToken = reg.accessToken;
    userId = reg.user._id;
  }, 180000);

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (replSet) {
      await replSet.stop();
    }
  }, 30000);

  let createdPropertyId: string;
  let createdBuyerId: string;
  let createdDealId: string;
  let createdAliasId: string;

  describe('Properties API (/api/v1/properties)', () => {
    it('POST / creates a property with auto-title and planGuard validation', async () => {
      const res = await request(app)
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'Plot',
          category: 'Residential',
          purpose: 'Sale',
          locality: 'Model Town',
          city: 'Panipat',
          size: { value: 150, unit: 'gaj' },
          priceDemandPaise: 450000000,
          owner: { name: 'Owner Ji', phone: '9812345678' },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('150 GAJ Plot — Model Town');
      expect(res.body.data.sizeGaj).toBe(150);
      createdPropertyId = res.body.data._id;
    });

    it('GET / lists user properties', async () => {
      const res = await request(app)
        .get('/api/v1/properties')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /:id returns single property details', async () => {
      const res = await request(app)
        .get(`/api/v1/properties/${createdPropertyId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(createdPropertyId);
    });

    it('PATCH /:id updates property details', async () => {
      const res = await request(app)
        .patch(`/api/v1/properties/${createdPropertyId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          priceDemandPaise: 460000000,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.priceDemandPaise).toBe(460000000);
    });

    it('PATCH /:id/status updates status', async () => {
      const res = await request(app)
        .patch(`/api/v1/properties/${createdPropertyId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'hold' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('hold');
    });

    it('POST /photos/sign generates signed upload credentials', async () => {
      const res = await request(app)
        .post('/api/v1/properties/photos/sign')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.signature).toBeDefined();
      expect(res.body.data.folder).toContain(`properties/${userId}`);
    });

    it('DELETE /properties/:id/photos/:publicId deletes photo scoped to user folder', async () => {
      // Add photo to property
      const validPublicId = `properties/${userId}/photo_1`;
      await request(app)
        .patch(`/api/v1/properties/${createdPropertyId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          photos: [{ url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', publicId: validPublicId }],
        });

      // Delete photo
      const delRes = await request(app)
        .delete(`/api/v1/properties/${createdPropertyId}/photos/${validPublicId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data.photos.length).toBe(0);

      // Attempt deletion of unauthorized folder publicId -> 403 Forbidden
      const unauthRes = await request(app)
        .delete(`/api/v1/properties/${createdPropertyId}/photos/properties/other_user_id/photo_99`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(unauthRes.status).toBe(403);
      expect(unauthRes.body.error.code).toBe('FORBIDDEN');
    });

    it('POST /api/v1/users/me/logo/sign generates signed logo credentials scoped to logos/:userId', async () => {
      const res = await request(app)
        .post('/api/v1/users/me/logo/sign')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.signature).toBeDefined();
      expect(res.body.data.folder).toBe(`logos/${userId}`);
    });
  });

  describe('Buyers API (/api/v1/buyers)', () => {
    it('POST / creates a buyer requirement with E.164 phone formatting', async () => {
      const res = await request(app)
        .post('/api/v1/buyers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Sunil Panipat',
          phone: '9812345678', // 10-digit Indian mobile
          purpose: 'Sale',
          types: ['Plot'],
          localities: [{ display: 'Model Town', key: 'model-town' }],
          budget: { minPaise: 400000000, maxPaise: 500000000 },
          urgency: 'hot',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.phoneE164).toBe('+919812345678');
      createdBuyerId = res.body.data._id;
    });

    it('GET / lists buyers', async () => {
      const res = await request(app)
        .get('/api/v1/buyers')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /:id returns single buyer details', async () => {
      const res = await request(app)
        .get(`/api/v1/buyers/${createdBuyerId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(createdBuyerId);
    });

    it('PATCH /:id updates buyer fields', async () => {
      const res = await request(app)
        .patch(`/api/v1/buyers/${createdBuyerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ urgency: 'warm' });

      expect(res.status).toBe(200);
      expect(res.body.data.urgency).toBe('warm');
    });
  });

  describe('Matches API (/api/v1/matches & resource match routes)', () => {
    it('GET /api/v1/properties/:id/matches finds buyers matching a property', async () => {
      const res = await request(app)
        .get(`/api/v1/properties/${createdPropertyId}/matches`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /api/v1/buyers/:id/matches finds properties matching a buyer', async () => {
      const res = await request(app)
        .get(`/api/v1/buyers/${createdBuyerId}/matches`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /api/v1/matches/quick evaluates ad-hoc match score', async () => {
      const res = await request(app)
        .post('/api/v1/matches/quick')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          property: {
            status: 'available',
            type: 'Plot',
            purpose: 'Sale',
            localityKey: 'model-town',
            priceDemandPaise: 450000000,
            sizeGaj: 150,
          },
          buyer: {
            purpose: 'Sale',
            types: ['Plot'],
            localities: [{ key: 'model-town', display: 'Model Town' }],
            anyLocality: false,
            budget: { minPaise: 400000000, maxPaise: 500000000 },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBeGreaterThan(0);
      expect(res.body.data.grade).toBeDefined();
    });
  });

  describe('Deals API (/api/v1/deals)', () => {
    it('POST / creates a deal with server-computed commission', async () => {
      const res = await request(app)
        .post('/api/v1/deals')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          buyerId: createdBuyerId,
          propertyId: createdPropertyId,
          propertyTitleSnapshot: '150 GAJ Plot — Model Town',
          valuePaise: 450000000,
          commission: { mode: 'percent', bps: 100 },
          stage: 'negotiating',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.commission.expectedPaise).toBe(4500000);
      createdDealId = res.body.data._id;
    });

    it('GET /summary computes pipeline figures', async () => {
      const res = await request(app)
        .get('/api/v1/deals/summary')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.expectedPipelinePaise).toBe(4500000);
    });

    it('POST /:id/payments records payment', async () => {
      const res = await request(app)
        .post(`/api/v1/deals/${createdDealId}/payments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amountPaise: 2000000,
          note: 'Token advance paid',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.payments.length).toBe(1);
    });

    it('PATCH /:id/stage manually updates deal stage', async () => {
      const res = await request(app)
        .patch(`/api/v1/deals/${createdDealId}/stage`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          stage: 'finalized',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.stage).toBe('finalized');
    });
  });

  describe('Locality Aliases API (/api/v1/aliases)', () => {
    it('POST / creates a custom locality alias', async () => {
      const res = await request(app)
        .post('/api/v1/aliases')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          city: 'Panipat',
          canonical: 'Model Town',
          aliases: ['MT', 'Model Twn', 'MT Panipat'],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.canonicalKey).toBe('model-town');
      createdAliasId = res.body.data._id;
    });

    it('GET / lists locality aliases', async () => {
      const res = await request(app)
        .get('/api/v1/aliases')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('PATCH /:id updates alias list', async () => {
      const res = await request(app)
        .patch(`/api/v1/aliases/${createdAliasId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          aliases: ['MT', 'Model Twn', 'MT Panipat', 'New MT'],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.aliases).toContain('New MT');
    });

    it('DELETE /:id deletes custom alias', async () => {
      const res = await request(app)
        .delete(`/api/v1/aliases/${createdAliasId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');
    });
  });

  describe('Dashboard API (/api/v1/dashboard/today)', () => {
    it('GET /today returns unified metrics for broker daily workflow', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/today')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.activeListingsCount).toBeDefined();
      expect(res.body.data.activeBuyersCount).toBeDefined();
      expect(res.body.data.pipeline).toBeDefined();
      expect(res.body.data.recentActivities).toBeDefined();
    });
  });
});
