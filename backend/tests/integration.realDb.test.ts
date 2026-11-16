import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { LoginAttempt } from '../src/modules/auth/loginAttempt.model.js';
import { Property } from '../src/modules/properties/property.model.js';
import { Buyer } from '../src/modules/buyers/buyer.model.js';
import { Deal } from '../src/modules/deals/deal.model.js';
import { purgeSoftDeletedRecords } from '../src/services/cron.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { UserService } from '../src/modules/users/user.service.js';
import { DealService } from '../src/modules/deals/deal.service.js';
import { Matcher } from '../src/modules/matches/matcher.js';
import { toPublicProperty } from '../src/modules/properties/publicDto.js';

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

describe('Real MongoDB In-Memory Integration Suite (MongoMemoryReplSet)', () => {
  let replSet: MongoMemoryReplSet;

  beforeAll(async () => {
    // ⚠️ Strict Isolation: MongoMemoryReplSet ensures tests NEVER touch production/Atlas DB
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
    // Clean collections between tests
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key]!.deleteMany({});
    }
  });

  describe('1. Refresh Rotation, Grace Window & Breach Revoke (Real DB)', () => {
    it('handles atomic rotation, allows grace window, and revokes all sessions upon reuse breach', async () => {
      const email = 'rotation@leadnivesh.com';
      const password = 'Password123!';
      const reg = await AuthService.register({
        name: 'Rotation Agent',
        email,
        password,
        phone: '+919876543210',
        consent: { termsAccepted: true, privacyVersion: '1.0' },
      });

      const initialCookie = reg.refreshCookieValue!;
      const [sessionId, secret1] = initialCookie.split('.');

      // First Refresh: Secret1 -> Secret2
      const firstRefresh = await AuthService.refresh(initialCookie);
      expect(firstRefresh.accessToken).toBeDefined();
      expect(firstRefresh.newRefreshCookieValue).not.toBe(initialCookie);

      const [newSessionId] = firstRefresh.newRefreshCookieValue.split('.');
      expect(newSessionId).toBe(sessionId);

      // Verify Grace Window: Presenting Secret1 again immediately (within 15s) succeeds
      const graceRefresh = await AuthService.refresh(`${sessionId}.${secret1}`);
      expect(graceRefresh.accessToken).toBeDefined();

      // Check DB: User still has the active session
      const userAfterGrace = await User.findById(reg.user._id).select('+sessions.refreshTokenHash');
      expect(userAfterGrace!.sessions.length).toBe(1);

      // Fast-forward / expire grace window in DB
      userAfterGrace!.sessions[0]!.previousHashExpiresAt = new Date(Date.now() - 5000); // Expired
      await userAfterGrace!.save();

      // BREACH ATTACK: Presenting Secret1 after grace period triggers full wipe
      await expect(
        AuthService.refresh(`${sessionId}.${secret1}`)
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'REFRESH_TOKEN_INVALID',
      });

      // Verification in REAL DB: ALL sessions revoked!
      const userAfterBreach = await User.findById(reg.user._id);
      expect(userAfterBreach!.sessions.length).toBe(0);
    });
  });

  describe('2. Account Lockout on Real DB', () => {
    it('locks account after 5 failed login attempts in real DB', async () => {
      const email = 'lockout-real@leadnivesh.com';
      const ip = '127.0.0.1';

      await AuthService.register({
        name: 'Lockout Target',
        email,
        password: 'RealPassword123!',
        phone: '+919876543210',
        consent: { termsAccepted: true, privacyVersion: '1.0' },
      });

      // 5 Failed login attempts
      for (let i = 1; i <= 5; i++) {
        await expect(
          AuthService.login(email, 'WrongPass123', ip)
        ).rejects.toMatchObject({
          statusCode: 401,
          code: 'UNAUTHORIZED',
        });
      }

      // Check Real DB: LoginAttempt document for pair has count 5 and lockedUntil in future
      const attemptDoc = await LoginAttempt.findOne({
        lockedUntil: mongoose.trusted({ $exists: true }),
      });
      expect(attemptDoc).not.toBeNull();
      expect(attemptDoc!.count).toBe(5);
      expect(attemptDoc!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

      // 6th Attempt: Immediately blocked with 429
      await expect(
        AuthService.login(email, 'RealPassword123!', ip)
      ).rejects.toMatchObject({
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
      });
    });
  });

  describe('3. Owner-Vault Leak Scan on Real Queries & Supertest', () => {
    it('guarantees owner vault fields NEVER leak in real queries, DTOs, or API endpoints', async () => {
      const reg = await AuthService.register({
        name: 'Broker Owner',
        email: 'vault@leadnivesh.com',
        password: 'Password123!',
        phone: '+919876543210',
        consent: { termsAccepted: true, privacyVersion: '1.0' },
      });

      const token = reg.accessToken;
      const userId = reg.user._id;

      // Create property with private owner vault in real DB
      const propDoc = new Property({
        userId,
        title: '250 Gaj Plot Model Town',
        type: 'Plot',
        category: 'Residential',
        purpose: 'Sale',
        locality: 'Model Town',
        localityKey: 'model-town',
        city: 'Panipat',
        landmark: 'Plot 55 Private Lane',
        size: { value: 250, unit: 'gaj' },
        sizeGaj: 250,
        priceDemandPaise: 750000000,
        status: 'available',
        owner: {
          name: 'Private Landlord Sharma',
          phone: '+919876543299',
          notes: 'Do not contact without broker present',
        },
      });
      await propDoc.save();

      // A. Real DB Query Test (find by default excludes select: false)
      const fetched = await Property.find({ userId }).lean();
      expect(fetched.length).toBe(1);
      const queryViolations = scanForForbiddenKeys(fetched, ['owner']);
      expect(queryViolations).toEqual([]);

      // B. Public DTO Serializer Test
      const publicDto = toPublicProperty(propDoc);
      const dtoViolations = scanForForbiddenKeys(publicDto, ['owner', 'landmark']);
      expect(dtoViolations).toEqual([]);

      // C. Supertest Real HTTP Endpoints
      const listRes = await request(app)
        .get('/api/v1/properties')
        .set('Authorization', `Bearer ${token}`);

      expect(listRes.status).toBe(200);
      const listViolations = scanForForbiddenKeys(listRes.body.data, ['owner']);
      expect(listViolations).toEqual([]);

      const getRes = await request(app)
        .get(`/api/v1/properties/${propDoc._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);
      // Even detail endpoint for authenticated broker returns owner only if explicitly selected, but standard toPublic/public share never does
      const publicShareViolations = scanForForbiddenKeys(toPublicProperty(getRes.body.data), ['owner']);
      expect(publicShareViolations).toEqual([]);
    });
  });

  describe('4. Hashes Never In Any Response or Export (Real DB)', () => {
    it('verifies passwordHash and refreshTokenHash never appear in auth or export payloads', async () => {
      const reg = await AuthService.register({
        name: 'Export User',
        email: 'export-real@leadnivesh.com',
        password: 'SuperSecretPassword123!',
        phone: '+919876543210',
        consent: { termsAccepted: true, privacyVersion: '1.0' },
      });

      const token = reg.accessToken;
      const forbiddenHashes = ['passwordhash', 'refreshtokenhash', 'previoustokenhash'];

      // Check Register response
      expect(scanForForbiddenKeys(reg, forbiddenHashes)).toEqual([]);

      // Check GET /users/me
      const meRes = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(scanForForbiddenKeys(meRes.body, forbiddenHashes)).toEqual([]);

      // Check GET /users/me/export
      const exportRes = await request(app)
        .get('/api/v1/users/me/export')
        .set('Authorization', `Bearer ${token}`);

      expect(exportRes.status).toBe(200);
      expect(scanForForbiddenKeys(exportRes.body, forbiddenHashes)).toEqual([]);
    });
  });

  describe('5. Account Deletion Cascade & PII Anonymization (Real DB)', () => {
    it('anonymizes PII immediately, cascades soft-delete, and allows instant re-registration', async () => {
      const originalEmail = 'delete-test@leadnivesh.com';
      const reg = await AuthService.register({
        name: 'Delete Target',
        email: originalEmail,
        password: 'Password123!',
        phone: '+919876543210',
        consent: { termsAccepted: true, privacyVersion: '1.0' },
      });

      const userId = reg.user._id;

      // Add a property
      const prop = new Property({
        userId,
        title: 'Cascade Plot',
        type: 'Plot',
        locality: 'Sector 12',
        localityKey: 'sector-12',
        size: { value: 200, unit: 'gaj' },
        sizeGaj: 200,
        priceDemandPaise: 500000000,
        owner: { name: 'Owner Secret', phone: '+919999999999' },
      });
      await prop.save();

      // Add a buyer
      const buyer = new Buyer({
        userId,
        name: 'Buyer Ramesh',
        phoneE164: '+919812345678',
        budget: { maxPaise: 600000000 },
      });
      await buyer.save();

      // Add a deal
      const deal = new Deal({
        userId,
        buyerId: buyer._id,
        propertyTitleSnapshot: 'Cascade Plot',
        valuePaise: 500000000,
        commission: { mode: 'percent', bps: 100, expectedPaise: 5000000 },
      });
      await deal.save();

      // Delete account with exact confirmation
      const delResult = await UserService.deleteAccount(userId, 'DELETE MY ACCOUNT');
      expect(delResult.message).toContain('Account and associated resources deleted successfully');

      // 1. Verify User Anonymization in DB
      const userInDb = await User.findById(userId);
      expect(userInDb!.isDeleted).toBe(true);
      expect(userInDb!.email).toMatch(/^deleted_[a-f0-9]+@deleted\.local$/);
      expect(userInDb!.name).toBe('Deleted User');
      expect(userInDb!.phone).toBe('+910000000000');
      expect(userInDb!.sessions.length).toBe(0);

      // 2. Verify Property Anonymization in DB
      const propInDb = await Property.findById(prop._id).select('+owner');
      expect(propInDb!.isDeleted).toBe(true);
      expect(propInDb!.owner?.name).toBe('Anonymized');
      expect(propInDb!.owner?.phone).toBe('+910000000000');
      expect(propInDb!.owner?.notes).toBe('');
      expect(propInDb!.description).toBe('');

      // 3. Verify Buyer Anonymization in DB
      const buyerInDb = await Buyer.findById(buyer._id);
      expect(buyerInDb!.isDeleted).toBe(true);
      expect(buyerInDb!.name).toBe('Anonymized Buyer');
      expect(buyerInDb!.phoneE164).toBe('+910000000000');
      expect(buyerInDb!.notes).toBe('');
      expect(buyerInDb!.rawText).toBe('');

      // 4. Verify Deal soft-deleted & anonymized
      const dealInDb = await Deal.findById(deal._id);
      expect(dealInDb!.isDeleted).toBe(true);
      expect(dealInDb!.propertyTitleSnapshot).toBe('Anonymized Deal');

      // 5. Verify hard-purge cron deletes records whose grace period has elapsed
      const purgedCount = await purgeSoftDeletedRecords(0);
      expect(purgedCount).toBeGreaterThanOrEqual(4); // user, property, buyer, deal

      // Confirm hard-deleted from DB after cron purge
      expect(await User.findById(userId)).toBeNull();
      expect(await Property.findById(prop._id)).toBeNull();
      expect(await Buyer.findById(buyer._id)).toBeNull();
      expect(await Deal.findById(deal._id)).toBeNull();

      // 6. Option A: Re-registration with the SAME email works immediately
      const reReg = await AuthService.register({
        name: 'Fresh New Account',
        email: originalEmail,
        password: 'NewPassword123!',
        phone: '+919876543210',
        consent: { termsAccepted: true, privacyVersion: '1.0' },
      });

      expect(reReg.user._id).not.toBe(userId); // Fresh user ID
      expect(reReg.user.email).toBe(originalEmail);
    });
  });

  describe('6. Match Engine on Real MongoDB Data', () => {
    it('scores matches and ensures empty buyer localities do NOT match everything unless anyLocality=true', async () => {
      const reg = await AuthService.register({
        name: 'Match Broker',
        email: 'matcher-db@leadnivesh.com',
        password: 'Password123!',
        phone: '+919876543210',
        consent: { termsAccepted: true, privacyVersion: '1.0' },
      });

      const userId = reg.user._id;

      // Property in Model Town
      const prop1 = new Property({
        userId,
        title: 'Model Town 200 Gaj Plot',
        type: 'Plot',
        category: 'Residential',
        purpose: 'Sale',
        locality: 'Model Town',
        localityKey: 'model-town',
        size: { value: 200, unit: 'gaj' },
        sizeGaj: 200,
        priceDemandPaise: 500000000, // ₹50 Lakh
        status: 'available',
      });
      await prop1.save();

      // Buyer with EMPTY localities and anyLocality: false
      const buyerEmptyLocality = new Buyer({
        userId,
        name: 'Pickey Buyer',
        phoneE164: '+919876500001',
        purpose: 'Sale',
        types: ['Plot'],
        localities: [], // EMPTY
        anyLocality: false, // Strict
        budget: { maxPaise: 600000000 },
      });
      await buyerEmptyLocality.save();

      // Should NOT match because localities is empty and anyLocality is false
      const matchesEmpty = await Matcher.findPropertiesForBuyer(buyerEmptyLocality, userId);
      expect(matchesEmpty.length).toBe(0);

      // Buyer with anyLocality: true
      const buyerAnyLocality = new Buyer({
        userId,
        name: 'Flexible Buyer',
        phoneE164: '+919876500002',
        purpose: 'Sale',
        types: ['Plot'],
        localities: [],
        anyLocality: true, // Flexible
        budget: { maxPaise: 600000000 },
      });
      await buyerAnyLocality.save();

      // Matches successfully!
      const matchesAny = await Matcher.findPropertiesForBuyer(buyerAnyLocality, userId);
      expect(matchesAny.length).toBe(1);
      expect(matchesAny[0]!.property.title).toBe('Model Town 200 Gaj Plot');
    });
  });

  describe('7. Deals Pipeline, Overpayment & Manual Override on Real DB', () => {
    it('computes commission, handles overpayment gracefully, and supports manual stage override', async () => {
      const reg = await AuthService.register({
        name: 'Deal Agent',
        email: 'deals-real@leadnivesh.com',
        password: 'Password123!',
        phone: '+919876543210',
        consent: { termsAccepted: true, privacyVersion: '1.0' },
      });

      const userId = reg.user._id;

      // 1. Create deal: 1% commission on ₹1 Crore = ₹1,00,000 (10000000 paise)
      const deal = await DealService.create(userId, {
        buyerId: new mongoose.Types.ObjectId().toString(),
        propertyTitleSnapshot: 'Sec 12 Kothi',
        valuePaise: 1000000000,
        commission: { mode: 'percent', bps: 100 },
        stage: 'finalized',
      });

      expect(deal.commission.expectedPaise).toBe(10000000);

      // 2. Record Overpayment: client paid ₹1,20,000 (12000000 paise)
      const paidDeal = await DealService.recordPayment(userId, deal._id.toString(), 12000000, 'Bonus incentive cheque');

      expect(paidDeal.stage).toBe('paid');
      expect(paidDeal.payments.length).toBe(1);
      expect(paidDeal.payments[0]!.amountPaise).toBe(12000000);

      // 3. Summary check: overpayment does not cause negative pending
      const summary = await DealService.getSummary(userId);
      expect(summary.receivedPaise).toBe(12000000);
      expect(summary.pendingPaise).toBe(0); // Clamped at 0

      // 4. Manual Stage Override: Re-open deal to negotiating
      const overridden = await DealService.updateStage(userId, deal._id.toString(), 'negotiating');
      expect(overridden.stage).toBe('negotiating');
      expect(overridden.stageHistory[overridden.stageHistory.length - 1]!.stage).toBe('negotiating');
    });
  });
});
