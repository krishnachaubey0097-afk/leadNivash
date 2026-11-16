import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { LoginAttempt } from '../src/modules/auth/loginAttempt.model.js';
import { Property } from '../src/modules/properties/property.model.js';
import { Buyer } from '../src/modules/buyers/buyer.model.js';
import { Deal } from '../src/modules/deals/deal.model.js';
import { ShareLink } from '../src/modules/shares/shareLink.model.js';
import { signAccessToken } from '../src/utils/jwt.js';

function mockQuery(val: any) {
  const p: any = Promise.resolve(val);
  p.select = vi.fn().mockReturnValue(Promise.resolve(val));
  return p;
}

describe('Auth & User API Endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(LoginAttempt, 'findOne').mockResolvedValue(null as any);
    vi.spyOn(LoginAttempt, 'findOneAndUpdate').mockResolvedValue({ count: 1 } as any);
    vi.spyOn(LoginAttempt, 'deleteOne').mockResolvedValue({ deletedCount: 1 } as any);
    vi.spyOn(Property, 'find').mockReturnValue({
      select: vi.fn().mockResolvedValue([]),
      lean: vi.fn().mockResolvedValue([]),
    } as any);
    vi.spyOn(Buyer, 'find').mockReturnValue({ lean: vi.fn().mockResolvedValue([]) } as any);
    vi.spyOn(Deal, 'find').mockReturnValue({ lean: vi.fn().mockResolvedValue([]) } as any);
    vi.spyOn(Property, 'updateMany').mockResolvedValue({ modifiedCount: 0 } as any);
    vi.spyOn(Buyer, 'updateMany').mockResolvedValue({ modifiedCount: 0 } as any);
    vi.spyOn(Deal, 'updateMany').mockResolvedValue({ modifiedCount: 0 } as any);
    vi.spyOn(ShareLink, 'updateMany').mockResolvedValue({ modifiedCount: 0 } as any);
    vi.spyOn(ShareLink, 'updateMany').mockResolvedValue({ modifiedCount: 0 } as any);
  });

  describe('POST /api/v1/auth/register', () => {
    it('registers user, returns 201 Created and sets secure HttpOnly cookie', async () => {
      vi.spyOn(User, 'findOne').mockReturnValue(mockQuery(null) as any);
      vi.spyOn(User.prototype, 'save').mockImplementation(function (this: any) {
        this._id = '64a1b2c3d4e5f6a7b8c9d0e1';
        return Promise.resolve(this);
      });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Sunil Kumar',
          email: 'sunil@leadnivesh.com',
          password: 'Password123!',
          phone: '+919876543210',
          agency: { name: 'Sunil Properties', city: 'Panipat' },
          consent: { termsAccepted: true, privacyVersion: '1.0' },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe('sunil@leadnivesh.com');

      // Verify Cookie Flags
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : String(cookies);
      expect(cookieStr).toContain('HttpOnly');
      expect(cookieStr).toContain('SameSite=Strict');
      expect(cookieStr).toContain('Path=/api/v1/auth');
    });

    it('rejects registration without terms consent (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Sunil Kumar',
          email: 'sunil@leadnivesh.com',
          password: 'Password123!',
          phone: '+919876543210',
          consent: { termsAccepted: false, privacyVersion: '1.0' },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('authenticates user and returns access token with HttpOnly cookie', async () => {
      const email = 'login-test@leadnivesh.com';
      const passwordHash = await bcrypt.hash('CorrectPassword123', 10);
      const mockUser: any = {
        _id: '64a1b2c3d4e5f6a7b8c9d0e1',
        email,
        name: 'Login Test',
        phone: '+919876543210',
        role: 'user',
        passwordHash,
        isDisabled: false,
        sessions: [],
        agency: { name: 'Test Agency', city: 'Panipat' },
        plan: { tier: 'trial' },
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(User, 'findOne').mockReturnValue(mockQuery(mockUser) as any);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'CorrectPassword123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : String(cookies);
      expect(cookieStr).toContain('HttpOnly');
      expect(cookieStr).toContain('SameSite=Strict');
    });

    it('returns generic 401 UNAUTHORIZED on wrong password (no email enumeration)', async () => {
      vi.spyOn(User, 'findOne').mockReturnValue(mockQuery(null) as any);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@leadnivesh.com', password: 'AnyPassword' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toBe('Invalid email or password');
    });
  });

  describe('User Endpoints (/api/v1/users/me)', () => {
    const userId = '64a1b2c3d4e5f6a7b8c9d0e1';
    const validToken = signAccessToken({
      _id: userId,
      email: 'user@leadnivesh.com',
      role: 'user',
      sessionId: 'sess_123',
    });

    it('GET /api/v1/users/me returns authenticated profile with plan limits', async () => {
      const mockUser: any = {
        _id: userId,
        email: 'user@leadnivesh.com',
        name: 'Profile User',
        phone: '+919876543210',
        role: 'user',
        agency: { name: 'Profile Agency', city: 'Panipat' },
        preferences: { language: 'en', budgetTolerancePct: 10, marlaToGaj: 30.25, defaultCity: 'Panipat' },
        plan: {
          tier: 'trial',
          trialEndsAt: new Date(Date.now() + 1000000),
          limits: { maxListings: 15, maxBuyers: 10, maxParsesMonthly: 100 },
        },
        consent: { termsAcceptedAt: new Date(), privacyVersion: '1.0' },
        createdAt: new Date(),
      };

      vi.spyOn(User, 'findOne').mockReturnValue(mockQuery(mockUser) as any);

      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('user@leadnivesh.com');
      expect(res.body.data.plan.limits.maxListings).toBe(15);
    });

    it('GET /api/v1/users/me/export returns full export bundle', async () => {
      const mockUser: any = {
        _id: userId,
        email: 'export@leadnivesh.com',
        name: 'Export User',
        phone: '+919876543210',
        role: 'user',
        agency: { name: 'Export Agency' },
        preferences: {},
        plan: {},
        sessions: [],
        createdAt: new Date(),
        consent: {},
      };

      vi.spyOn(User, 'findOne').mockReturnValue(mockQuery(mockUser) as any);

      const res = await request(app)
        .get('/api/v1/users/me/export')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.account).toBeDefined();
      expect(res.body.data.exportedAt).toBeDefined();
    });

    it('DELETE /api/v1/users/me rejects deletion if confirm text does not match', async () => {
      const res = await request(app)
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ confirmText: 'wrong text' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('DELETE /api/v1/users/me soft-deletes user when confirm text matches', async () => {
      const mockUser: any = {
        _id: userId,
        email: 'user@leadnivesh.com',
        isDeleted: false,
        sessions: ['s1'],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(User, 'findOne').mockReturnValue(mockQuery(mockUser) as any);

      const res = await request(app)
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ confirmText: 'DELETE MY ACCOUNT' });

      expect(res.status).toBe(200);
      expect(mockUser.isDeleted).toBe(true);
      expect(mockUser.sessions).toEqual([]);
    });
  });
});
