import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { Property } from '../src/modules/properties/property.model.js';
import { Inquiry } from '../src/modules/inquiries/inquiry.model.js';
import { ActivityLog } from '../src/modules/activity/activityLog.model.js';
import { ContactLead } from '../src/modules/contact/contactLead.model.js';
import { signAccessToken } from '../src/utils/jwt.js';

describe('Inquiry Redesign & Founder Contact Leads', () => {
  let replSet: MongoMemoryReplSet;
  let brokerUser: any;
  let adminUser: any;
  let brokerToken: string;
  let adminToken: string;
  let property: any;

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
    await Inquiry.deleteMany({});
    await ActivityLog.deleteMany({});
    await ContactLead.deleteMany({});

    brokerUser = await User.create({
      name: 'Broker Inquiries',
      email: 'broker.inquiries@example.com',
      passwordHash: 'hashed_pw',
      phone: '+919876543210',
      role: 'user',
      consent: { termsAcceptedAt: new Date(), privacyVersion: '1.0' },
    });

    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin.leads@example.com',
      passwordHash: 'hashed_pw',
      phone: '+919999988888',
      role: 'admin',
      consent: { termsAcceptedAt: new Date(), privacyVersion: '1.0' },
    });

    brokerToken = signAccessToken({
      _id: brokerUser._id.toString(),
      email: brokerUser.email,
      role: 'user',
      sessionId: 'sess_broker',
    });

    adminToken = signAccessToken({
      _id: adminUser._id.toString(),
      email: adminUser.email,
      role: 'admin',
      sessionId: 'sess_admin',
    });

    property = await Property.create({
      userId: brokerUser._id,
      title: 'Commercial Shop in Sector 11 Panipat',
      type: 'Shop',
      category: 'Commercial',
      purpose: 'Sale',
      locality: 'Sector 11',
      localityKey: 'sector 11',
      city: 'Panipat',
      priceDemandPaise: 2500000000,
      size: { value: 120, unit: 'gaj' },
      sizeGaj: 120,
      isDeleted: false,
    });
  });

  it('records inquiry, creates non-PII ActivityLog for broker, and broker can fetch via GET /api/v1/inquiries', async () => {
    const inquiryRes = await request(app)
      .post('/api/v1/public/inquiries')
      .send({
        propertyId: property._id.toString(),
        name: 'Vikas Sharma',
        phone: '9812345678',
        message: 'Interested in purchasing this commercial SCO.',
      });

    expect(inquiryRes.status).toBe(201);
    expect(inquiryRes.body.success).toBe(true);

    // Verify non-PII ActivityLog created for broker
    const log = await ActivityLog.findOne({
      userId: brokerUser._id,
      type: 'inquiry_received',
    });
    expect(log).toBeDefined();
    expect(log?.entityType).toBe('property');
    expect(log?.entityId?.toString()).toBe(property._id.toString());
    // STRICT PII CHECK: Ensure phone, buyer name, or raw contact details NEVER appear in ActivityLog
    const logMeta = JSON.stringify(log?.meta || {});
    expect(logMeta).not.toContain('Vikas');
    expect(logMeta).not.toContain('9812345678');

    // Broker fetches inquiries via GET /api/v1/inquiries
    const brokerInquiriesRes = await request(app)
      .get('/api/v1/inquiries')
      .set('Authorization', `Bearer ${brokerToken}`);

    expect(brokerInquiriesRes.status).toBe(200);
    expect(brokerInquiriesRes.body.success).toBe(true);
    expect(brokerInquiriesRes.body.data.items.length).toBe(1);
    expect(brokerInquiriesRes.body.data.items[0].name).toBe('Vikas Sharma');
    expect(brokerInquiriesRes.body.data.items[0].phoneE164).toBe('+919812345678');
  });

  it('drops spam inquiry silently if honeypot website field is populated', async () => {
    const botRes = await request(app)
      .post('/api/v1/public/inquiries')
      .send({
        propertyId: property._id.toString(),
        name: 'Bot Spammer',
        phone: '9812345678',
        website: 'http://spam-link.com',
      });

    expect(botRes.status).toBe(201);
    const count = await Inquiry.countDocuments();
    expect(count).toBe(0);
  });

  it('accepts landing page contact lead, hashes IP, normalizes phone, and admin lists leads', async () => {
    const contactRes = await request(app)
      .post('/api/v1/public/contact')
      .send({
        name: 'Anil Gupta',
        email: 'anil.gupta@example.com',
        phone: '9811122233',
        message: 'We manage 50 listings in Panipat and want a team demo.',
        city: 'Panipat',
        agencyName: 'Gupta Properties',
      });

    expect(contactRes.status).toBe(201);
    expect(contactRes.body.success).toBe(true);

    const leadInDb = await ContactLead.findOne({ email: 'anil.gupta@example.com' });
    expect(leadInDb).toBeDefined();
    expect(leadInDb?.phoneE164).toBe('+919811122233');
    expect(leadInDb?.ipHash).toBeDefined();

    // Admin lists leads
    const adminRes = await request(app)
      .get('/api/v1/admin/contacts')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.success).toBe(true);
    expect(adminRes.body.data.items.length).toBe(1);
    expect(adminRes.body.data.items[0].name).toBe('Anil Gupta');

    // Non-admin is blocked with 403 on admin AND public contact listing routes
    const forbiddenRes = await request(app)
      .get('/api/v1/admin/contacts')
      .set('Authorization', `Bearer ${brokerToken}`);
    expect(forbiddenRes.status).toBe(403);

    const forbiddenPublicContactRes = await request(app)
      .get('/api/v1/public/contact')
      .set('Authorization', `Bearer ${brokerToken}`);
    expect(forbiddenPublicContactRes.status).toBe(403);

    const forbiddenAliasContactRes = await request(app)
      .get('/api/v1/contact')
      .set('Authorization', `Bearer ${brokerToken}`);
    expect(forbiddenAliasContactRes.status).toBe(403);

    const adminPublicContactRes = await request(app)
      .get('/api/v1/public/contact')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminPublicContactRes.status).toBe(200);
    expect(adminPublicContactRes.body.data.items.length).toBe(1);
  });
});
