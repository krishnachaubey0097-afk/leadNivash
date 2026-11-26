import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { EmailOtp } from '../src/modules/auth/emailOtp.model.js';
import { AuthLoginLog } from '../src/modules/auth/authLoginLog.model.js';
import { LoginAttempt } from '../src/modules/auth/loginAttempt.model.js';

describe('Multi-Method Auth (Google OAuth, Email OTP & Existing Account Linking) in MongoDB', () => {
  let replSet: MongoMemoryReplSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    await mongoose.connect(replSet.getUri());
  }, 60000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await mongoose.disconnect();
    await replSet.stop();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([
      User.deleteMany({}),
      EmailOtp.deleteMany({}),
      AuthLoginLog.deleteMany({}),
      LoginAttempt.deleteMany({}),
    ]);
  });

  it('GET /api/v1/auth/providers exposes live auth capability flags cleanly', async () => {
    const res = await request(app).get('/api/v1/auth/providers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.passwordEnabled).toBe(true);
    expect(res.body.data).toHaveProperty('googleEnabled');
    expect(res.body.data).toHaveProperty('emailOtpEnabled');
  });

  it('Email OTP Registration & Login stores hashed OTP, tracks failed attempts, creates User + Session + AuthLoginLog in MongoDB', async () => {
    const email = 'otp.broker@example.com';

    // 1. Send OTP for registration
    const sendRes = await request(app)
      .post('/api/v1/auth/send-otp')
      .send({ email, purpose: 'register' });

    expect(sendRes.status).toBe(200);
    expect(sendRes.body.data.devOtp).toMatch(/^\d{6}$/);
    const devOtp = sendRes.body.data.devOtp;

    // Assert hashed OTP persisted in MongoDB (never plain text)
    const otpDoc = await EmailOtp.findOne({ email, purpose: 'register' });
    expect(otpDoc).not.toBeNull();
    expect(otpDoc!.otpHash).not.toBe(devOtp);

    // 2. Wrong OTP fails and increments attempt counter in MongoDB
    const badRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email, otp: '000000', purpose: 'register' });
    expect(badRes.status).toBe(400);
    const updatedOtpDoc = await EmailOtp.findOne({ email, purpose: 'register' });
    expect(updatedOtpDoc!.attempts).toBe(1);

    // 3. Correct OTP returns onboarding token
    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email, otp: devOtp, purpose: 'register' });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.verified).toBe(true);
    expect(verifyRes.body.data.requiresOnboarding).toBe(true);
    const verificationToken = verifyRes.body.data.verificationToken;
    expect(verificationToken).toBeTruthy();

    // 4. Complete registration using verificationToken + phone + optional password
    const completeRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({
        email,
        verificationToken,
        purpose: 'register',
        name: 'Vikram Singh',
        phone: '+919811223344',
        agencyName: 'Singh Realty',
        city: 'Karnal',
        password: 'BrokerPassword@123',
        consent: { termsAccepted: true, privacyVersion: '1.0' },
      });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.accessToken).toBeTruthy();
    expect(completeRes.body.data.user.emailVerified).toBe(true);
    expect(completeRes.body.data.user.authProviders).toEqual(
      expect.arrayContaining(['password', 'email_otp'])
    );

    // Verify User & AuthLoginLog saved in MongoDB & consumed EmailOtp cleaned up
    const dbUser = await User.findOne({ email });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.sessions.length).toBe(1);
    expect(dbUser!.sessions[0].authMethod).toBe('email_otp');
    expect(await EmailOtp.findOne({ email, purpose: 'register' })).toBeNull();

    const logs = await AuthLoginLog.find({ userId: dbUser!._id });
    expect(logs.length).toBe(1);
    expect(logs[0].method).toBe('email_otp');
    expect(logs[0].action).toBe('register');

    // 5. Existing account can log in again via Email OTP OR Email + Password
    const loginSendRes = await request(app)
      .post('/api/v1/auth/send-otp')
      .send({ email, purpose: 'login' });
    expect(loginSendRes.status).toBe(200);
    expect(loginSendRes.body.data.accountExists).toBe(true);

    const otpLoginRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email, otp: loginSendRes.body.data.devOtp, purpose: 'login' });
    expect(otpLoginRes.status).toBe(200);
    expect(otpLoginRes.body.data.accessToken).toBeTruthy();

    const pwdLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'BrokerPassword@123' });
    expect(pwdLoginRes.status).toBe(200);
    expect(pwdLoginRes.body.data.accessToken).toBeTruthy();

    const allLogs = await AuthLoginLog.find({ userId: dbUser!._id }).sort({ createdAt: 1 });
    expect(allLogs.map((l) => l.method)).toEqual(['email_otp', 'email_otp', 'password']);
  });

  it('Google OAuth creates new user with phone prompt and seamlessly links to existing Email+Password accounts', async () => {
    const email = 'hybrid.broker@gmail.com';

    // 1. Register first via Email & Password
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Hybrid Broker',
        email,
        password: 'StrongPassword@123',
        phone: '+919876500001',
        agency: { name: 'Hybrid Estates', city: 'Panipat' },
        consent: { termsAccepted: true, privacyVersion: '1.0' },
      });
    expect(regRes.status).toBe(201);

    // 2. Mock Google OAuth userinfo response for the SAME email
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sub: 'google-uid-999111',
        email,
        name: 'Hybrid Broker',
        email_verified: true,
      }),
    } as any);

    const gLoginExisting = await request(app)
      .post('/api/v1/auth/google')
      .send({ accessToken: 'mock-google-oauth-access-token-123456' });

    expect(gLoginExisting.status).toBe(200);
    expect(gLoginExisting.body.data.accessToken).toBeTruthy();
    expect(gLoginExisting.body.data.user.hasGoogleLinked).toBe(true);
    expect(gLoginExisting.body.data.user.emailVerified).toBe(true);
    expect(gLoginExisting.body.data.user.authProviders).toEqual(
      expect.arrayContaining(['password', 'google'])
    );

    // Check MongoDB persisted googleId + link_provider AuthLoginLog
    const dbUser = await User.findOne({ email });
    expect(dbUser!.googleId).toBe('google-uid-999111');
    const linkLog = await AuthLoginLog.findOne({ userId: dbUser!._id, method: 'google' });
    expect(linkLog).not.toBeNull();
    expect(linkLog!.action).toBe('link_provider');

    // 3. Brand new user via Google ID token (requiresPhone -> complete with phone)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sub: 'google-uid-brandnew-222',
        email: 'brandnew.google@gmail.com',
        name: 'Fresh Google Broker',
        email_verified: 'true',
      }),
    } as any);

    const gNewStep1 = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'mock-google-id-token-jwt-abcdef123456' });
    expect(gNewStep1.status).toBe(200);
    expect(gNewStep1.body.data.requiresPhone).toBe(true);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sub: 'google-uid-brandnew-222',
        email: 'brandnew.google@gmail.com',
        name: 'Fresh Google Broker',
        email_verified: 'true',
      }),
    } as any);

    const gNewStep2 = await request(app)
      .post('/api/v1/auth/google')
      .send({
        credential: 'mock-google-id-token-jwt-abcdef123456',
        phone: '+919988776655',
        agencyName: 'Google Realty',
        city: 'Gurugram',
        consent: { termsAccepted: true, privacyVersion: '1.0' },
      });

    expect(gNewStep2.status).toBe(200);
    expect(gNewStep2.body.data.accessToken).toBeTruthy();
    expect(gNewStep2.body.data.user.authProviders).toEqual(['google']);

    const newDbUser = await User.findOne({ email: 'brandnew.google@gmail.com' });
    expect(newDbUser).not.toBeNull();
    expect(newDbUser!.googleId).toBe('google-uid-brandnew-222');
    expect(newDbUser!.lastLoginMethod).toBe('google');
  });
});
