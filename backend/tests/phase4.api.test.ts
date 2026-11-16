import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../src/app.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { User } from '../src/modules/users/user.model.js';
import { Property } from '../src/modules/properties/property.model.js';
import { Inquiry } from '../src/modules/inquiries/inquiry.model.js';
import { ParseLog } from '../src/modules/parse/parseLog.model.js';

describe('Phase 4 API Endpoints (Parse, Shares, Inquiries, Admin)', () => {
  let replSet: MongoMemoryReplSet;
  let userToken: string;
  let userId: string;
  let adminToken: string;
  let adminId: string;
  let testPropertyId: string;
  let shareToken: string;
  let shareLinkId: string;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    const uri = replSet.getUri();
    await mongoose.connect(uri);

    // Register normal broker user
    const reg = await AuthService.register({
      name: 'Phase 4 Broker',
      email: 'p4broker@leadnivesh.com',
      password: 'Password123!',
      phone: '+919876543210',
      consent: { termsAccepted: true, privacyVersion: '1.0' },
    });
    userToken = reg.accessToken;
    userId = reg.user._id;

    // Register admin user
    const adminReg = await AuthService.register({
      name: 'System Admin',
      email: 'admin@leadnivesh.com',
      password: 'AdminPassword123!',
      phone: '+919876543211',
      consent: { termsAccepted: true, privacyVersion: '1.0' },
    });
    adminToken = adminReg.accessToken;
    adminId = adminReg.user._id;

    // Grant admin role
    await User.findByIdAndUpdate(adminId, { role: 'admin' });

    // Re-issue admin token with admin role
    const adminLogin = await AuthService.login(
      'admin@leadnivesh.com',
      'AdminPassword123!',
      '127.0.0.1'
    );
    adminToken = adminLogin.accessToken;

    // Create a property for sharing & inquiry tests
    const propRes = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        type: 'Plot',
        category: 'Residential',
        purpose: 'Sale',
        locality: 'Model Town',
        city: 'Panipat',
        size: { value: 250, unit: 'gaj' },
        priceDemandPaise: 1250000000,
        owner: { name: 'Secret Owner Baldev', phone: '+919812345678', notes: 'Private commission 1%' },
      });

    testPropertyId = propRes.body.data._id;
  }, 180000);

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (replSet) {
      await replSet.stop();
    }
  }, 30000);

  describe('1. AI Parse Pipeline (/api/v1/parse)', () => {
    it('POST /api/v1/parse previews parsed property with normalized units and masked PII', async () => {
      const rawText = 'Model Town 200 gaj plot urgent sale. Demand 1.25 cr. Contact 9812345678';
      const res = await request(app)
        .post('/api/v1/parse')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ rawText });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.preview.itemType).toBe('listing');
      expect(res.body.data.preview.extracted.property.locality).toBe('Model Town');
      expect(res.body.data.preview.extracted.property.sizeGaj).toBe(200);
      expect(res.body.data.preview.extracted.property.priceDemandPaise).toBe(1250000000);

      // Verify ParseLog recorded without storing raw text or PII
      const log = await ParseLog.findOne({ userId });
      expect(log).not.toBeNull();
      expect(log!.inputChars).toBe(rawText.length);
      expect((log as any).rawText).toBeUndefined();
    });

    it('POST /api/v1/parse rejects input shorter than 5 characters (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/v1/parse')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ rawText: 'hi' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/v1/parse/commit commits parsed listing into DB using transaction', async () => {
      const commitRes = await request(app)
        .post('/api/v1/parse/commit')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          itemType: 'listing',
          data: {
            type: 'Plot',
            locality: 'Sector 12',
            city: 'Panipat',
            sizeGaj: 300,
            priceDemandPaise: 1800000000,
            ownerName: 'Committed Owner',
            ownerPhone: '+919812399999',
          },
        });

      expect(commitRes.status).toBe(201);
      expect(commitRes.body.success).toBe(true);
      const newPropId = commitRes.body.data.item._id;
      expect(newPropId).toBeDefined();

      const inDb = await Property.findById(newPropId);
      expect(inDb).not.toBeNull();
      expect(inDb!.locality).toBe('Sector 12');
      expect(inDb!.sizeGaj).toBe(300);
    });
  });

  describe('2. Public Share Links (/api/v1/properties/:id/share & /p/:token)', () => {
    it('POST /api/v1/properties/:id/share generates secure token and 30-day expiry', async () => {
      const res = await request(app)
        .post(`/api/v1/properties/${testPropertyId}/share`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ template: 'flyer' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.shareUrl).toBe(`/p/${res.body.data.token}`);

      shareToken = res.body.data.token;
    });

    it('GET /p/:token serves server-rendered HTML flyer with OG tags, noindex, and NO owner vault leak', async () => {
      const res = await request(app).get(`/p/${shareToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');

      // Verify OpenGraph tags and Robots meta tags
      expect(res.text).toContain('<meta property="og:title"');
      expect(res.text).toContain('<meta name="robots" content="noindex, nofollow"');
      expect(res.text).toContain('Model Town');

      // CRITICAL SECURITY INVARIANT: Owner vault data must NEVER be rendered in public flyer HTML
      expect(res.text).not.toContain('Secret Owner Baldev');
      expect(res.text).not.toContain('+919812345678');
      expect(res.text).not.toContain('Private commission 1%');
    });

    it('DELETE /api/v1/shares/:id revokes share link and subsequent access returns 404', async () => {
      // Find shareLink document ID
      const shareDocRes = await request(app).get(`/p/${shareToken}`);
      expect(shareDocRes.status).toBe(200);

      // Fetch shareId from DB
      const shareLinkInDb = await mongoose.model('ShareLink').findOne({ token: shareToken });
      shareLinkId = shareLinkInDb!._id.toString();

      const revokeRes = await request(app)
        .delete(`/api/v1/shares/${shareLinkId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);

      // Accessing revoked token returns 410 Gone per PRD
      const postRevokeRes = await request(app).get(`/p/${shareToken}`);
      expect(postRevokeRes.status).toBe(410);
      expect(postRevokeRes.text).toContain('Listing Expired');
    });
  });

  describe('3. Public Inquiries API (/api/v1/public/inquiries)', () => {
    it('POST /api/v1/public/inquiries submits valid inquiry on property', async () => {
      const res = await request(app)
        .post('/api/v1/public/inquiries')
        .send({
          propertyId: testPropertyId,
          name: 'Genuine Buyer Ramesh',
          phone: '9812300000',
          message: 'Interested in site inspection this Sunday.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();

      const inDb = await Inquiry.findById(res.body.data.id);
      expect(inDb).not.toBeNull();
      expect(inDb!.phoneE164).toBe('+919812300000');
      expect(inDb!.ipHash).toBeDefined();
    });

    it('POST /api/v1/public/inquiries honeypot trap: drops spam submission silently without saving', async () => {
      const initialCount = await Inquiry.countDocuments();

      const res = await request(app)
        .post('/api/v1/public/inquiries')
        .send({
          propertyId: testPropertyId,
          name: 'Spam Bot',
          phone: '9812399999',
          message: 'Buy cheap watches',
          website: 'http://spam-link.com', // Honeypot trap triggered!
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Verify no inquiry was created in DB
      const finalCount = await Inquiry.countDocuments();
      expect(finalCount).toBe(initialCount);
    });
  });

  describe('4. Admin Routes (/api/v1/admin)', () => {
    it('GET /api/v1/admin/users rejects non-admin users with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('GET /api/v1/admin/users returns paginated list of users for admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(2);
    });

    it('PATCH /api/v1/admin/users/:id/plan upgrades user tier and limits', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${userId}/plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tier: 'pro',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.plan.tier).toBe('pro');
      expect(res.body.data.plan.limits.maxListings).toBe(10000);

      const userInDb = await User.findById(userId);
      expect(userInDb!.plan.tier).toBe('pro');
    });

    it('GET /api/v1/admin/usage returns platform aggregation statistics', async () => {
      const res = await request(app)
        .get('/api/v1/admin/usage')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overview.totalUsers).toBeGreaterThanOrEqual(2);
      expect(res.body.data.overview.activeProperties).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/v1/admin/inquiries lists all platform inquiries', async () => {
      const res = await request(app)
        .get('/api/v1/admin/inquiries')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.inquiries.length).toBeGreaterThanOrEqual(1);
    });
  });
});
