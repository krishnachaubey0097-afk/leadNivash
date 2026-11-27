import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/modules/users/user.model.js';
import { PaymentRecord } from '../src/modules/payments/paymentRecord.model.js';
import { signAccessToken } from '../src/utils/jwt.js';

describe('Cashfree Payments, AutoPay Subscriptions & MongoDB Plan Sync', () => {
  let replSet: MongoMemoryReplSet;
  const origAppId = env.CASHFREE_APP_ID;
  const origSecret = env.CASHFREE_SECRET_KEY;
  const origWebhook = env.CASHFREE_WEBHOOK_SECRET;
  const origEnv = env.CASHFREE_ENV;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    await mongoose.connect(replSet.getUri());
  }, 60000);

  afterAll(async () => {
    (env as any).CASHFREE_APP_ID = origAppId;
    (env as any).CASHFREE_SECRET_KEY = origSecret;
    (env as any).CASHFREE_WEBHOOK_SECRET = origWebhook;
    (env as any).CASHFREE_ENV = origEnv;
    vi.restoreAllMocks();
    await mongoose.disconnect();
    await replSet.stop();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    (env as any).CASHFREE_APP_ID = 'TEST123456789APP';
    (env as any).CASHFREE_SECRET_KEY = 'cfsk_ma_test_secret_key_for_unit_suite';
    (env as any).CASHFREE_WEBHOOK_SECRET = 'cf_webhook_secret_unit_suite';
    (env as any).CASHFREE_ENV = 'sandbox';
    await Promise.all([User.deleteMany({}), PaymentRecord.deleteMany({})]);
  });

  async function seedBroker() {
    const user = await User.create({
      name: 'Payment Broker',
      email: `pay_${Date.now()}@example.com`,
      passwordHash: '$2a$12$dummyhashdummyhashdummyhashdummyhashdummyhashdu',
      phone: '+919876543210',
      role: 'user',
      plan: {
        tier: 'trial',
        trialEndsAt: new Date(Date.now() + 7 * 86400000),
        limits: {
          maxListings: 15,
          maxBuyers: 10,
          maxParsesMonthly: 100,
          maxPhotosPerListing: 4,
          flyerBranding: false,
          supportLevel: 'standard',
        },
      },
      consent: { termsAcceptedAt: new Date(), privacyVersion: '1.0' },
      sessions: [],
    });

    const token = signAccessToken({
      _id: user._id.toString(),
      email: user.email,
      role: 'user',
      sessionId: 'sess_pay_test',
    });

    return { user, token };
  }

  it('GET /api/v1/payments/config returns Cashfree configuration & plan catalog', async () => {
    const res = await request(app).get('/api/v1/payments/config');
    expect(res.status).toBe(200);
    expect(res.body.data.cashfreeEnabled).toBe(true);
    expect(res.body.data.mode).toBe('sandbox');
    expect(res.body.data.plans.map((p: any) => p.planCode)).toEqual([
      'monthly_399',
      'yearly_trial_3299',
      'yearly_3999',
    ]);
  });

  it('creates AutoPay subscription, verifies ACTIVE return, upgrades User plan in MongoDB, and supports cancel', async () => {
    const { user, token } = await seedBroker();

    // Mock Cashfree GET plan -> 404, POST plan -> 200, POST subscription -> 200
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ plan_id: 'leadnivash_monthly_399' }) } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          cf_subscription_id: 998877,
          subscription_session_id: 'sub_session_abc123',
          subscription_status: 'INITIALIZED',
        }),
      } as any);

    const checkoutRes = await request(app)
      .post('/api/v1/payments/cashfree/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'monthly_399', mode: 'autopay' });

    expect(checkoutRes.status).toBe(200);
    expect(checkoutRes.body.data.flow).toBe('subscription');
    expect(checkoutRes.body.data.sessionId).toBe('sub_session_abc123');
    const subscriptionId = checkoutRes.body.data.subscriptionId;

    const dbRecord = await PaymentRecord.findOne({ cashfreeId: subscriptionId });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord!.status).toBe('INITIATED');

    // Mock verify response (ACTIVE)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ subscription_id: subscriptionId, subscription_status: 'ACTIVE' }),
    } as any);

    const verifyRes = await request(app)
      .post('/api/v1/payments/cashfree/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ subscriptionId });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.activated).toBe(true);
    expect(verifyRes.body.data.planTier).toBe('lite');

    const updatedUser = await User.findById(user._id);
    expect(updatedUser!.plan.tier).toBe('lite');
    expect(updatedUser!.plan.limits.maxListings).toBe(50);

    // Cancel AutoPay subscription
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ subscription_status: 'CANCELLED' }),
    } as any);

    const cancelRes = await request(app)
      .post('/api/v1/payments/cashfree/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ subscriptionId });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.cancelled).toBe(true);

    const cancelledDoc = await PaymentRecord.findOne({ cashfreeId: subscriptionId });
    expect(cancelledDoc!.status).toBe('CANCELLED');
    expect(cancelledDoc!.autopayEnabled).toBe(false);
  });

  it('rejects forged Cashfree webhooks (401) and activates/extends Pro plan on valid HMAC-SHA256 webhook', async () => {
    const { user, token } = await seedBroker();

    // Create one-time PG Order directly via mocked Cashfree /orders
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        cf_order_id: 554433,
        payment_session_id: 'session_order_xyz789',
      }),
    } as any);

    const checkoutRes = await request(app)
      .post('/api/v1/payments/cashfree/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'yearly_trial_3299', mode: 'one_time' });

    expect(checkoutRes.status).toBe(200);
    const orderId = checkoutRes.body.data.orderId;

    // 1. Invalid signature rejected
    const badWebhook = await request(app)
      .post('/api/v1/payments/cashfree/webhook')
      .set('x-webhook-timestamp', '1700000000')
      .set('x-webhook-signature', 'invalidsig')
      .send({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: orderId } } });
    expect(badWebhook.status).toBe(401);

    // 2. Valid HMAC-SHA256 webhook activates pro plan in MongoDB
    const payloadObj = {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: orderId, order_status: 'PAID' },
        payment: { cf_payment_id: 'cf_pay_99001', payment_status: 'SUCCESS' },
      },
    };
    const rawBody = JSON.stringify(payloadObj);
    const timestamp = '1700000001';
    const sig = crypto
      .createHmac('sha256', env.CASHFREE_WEBHOOK_SECRET!)
      .update(`${timestamp}${rawBody}`)
      .digest('base64');

    const okWebhook = await request(app)
      .post('/api/v1/payments/cashfree/webhook')
      .set('Content-Type', 'application/json')
      .set('x-webhook-timestamp', timestamp)
      .set('x-webhook-signature', sig)
      .send(rawBody);

    expect(okWebhook.status).toBe(200);
    expect(okWebhook.body.data.processed).toBe(true);
    expect(okWebhook.body.data.status).toBe('PAID');

    const upgradedUser = await User.findById(user._id);
    expect(upgradedUser!.plan.tier).toBe('pro');
    expect(upgradedUser!.plan.limits.maxListings).toBe(10000);
  });
});
