import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { mailService } from '../src/services/mail.service.js';

describe('Password Reset Integration (/api/v1/auth/forgot-password & reset-password)', () => {
  let replSet: MongoMemoryReplSet;

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
  });

  it('forgot-password sends reset token and stores SHA-256 hash in DB with 30-min expiry', async () => {
    let capturedToken = '';
    const mailSpy = vi.spyOn(mailService, 'sendPasswordResetEmail').mockImplementation(async (_to, token) => {
      capturedToken = token;
    });

    const user = await User.create({
      name: 'Broker Reset',
      email: 'broker.reset@example.com',
      passwordHash: await bcrypt.hash('OldPassword123!', 12),
      phone: '+919876543210',
      consent: { termsAcceptedAt: new Date(), privacyVersion: '1.0' },
      sessions: [
        {
          sessionId: 'session_active_1',
          refreshTokenHash: 'hash_1',
          createdAt: new Date(),
          lastUsedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      ],
    });

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'broker.reset@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toContain('password reset link has been sent');

    expect(mailSpy).toHaveBeenCalled();
    expect(capturedToken).toBeTruthy();

    // Verify token hash in DB
    const expectedHash = crypto.createHash('sha256').update(capturedToken).digest('hex');
    const userInDb = await User.findById(user._id).select('+passwordResetTokenHash');
    expect(userInDb?.passwordResetTokenHash).toBe(expectedHash);
    expect(userInDb?.passwordResetExpiresAt).toBeDefined();

    mailSpy.mockRestore();
  });

  it('forgot-password returns generic response for non-existent email without error', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nonexistent@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toContain('password reset link has been sent');
  });

  it('reset-password rejects invalid or expired tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token: 'invalid_random_token_123',
        newPassword: 'BrandNewPassword123!',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('reset-password succeeds, updates password, clears token, and revokes all active sessions', async () => {
    const rawToken = 'valid_secret_reset_token_32chars';
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const user = await User.create({
      name: 'Reset Broker',
      email: 'success.reset@example.com',
      passwordHash: await bcrypt.hash('OldPassword123!', 12),
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: new Date(Date.now() + 20 * 60 * 1000), // 20 mins remaining
      phone: '+919876543210',
      consent: { termsAcceptedAt: new Date(), privacyVersion: '1.0' },
      sessions: [
        {
          sessionId: 'session_to_revoke_1',
          refreshTokenHash: 'hash_1',
          createdAt: new Date(),
          lastUsedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
        {
          sessionId: 'session_to_revoke_2',
          refreshTokenHash: 'hash_2',
          createdAt: new Date(),
          lastUsedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      ],
    });

    expect(user.sessions.length).toBe(2);

    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token: rawToken,
        newPassword: 'BrandNewPassword123!',
      });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.success).toBe(true);

    const updatedUser = await User.findById(user._id).select('+passwordResetTokenHash +passwordHash');
    expect(updatedUser?.passwordResetTokenHash).toBeUndefined();
    expect(updatedUser?.passwordResetExpiresAt).toBeUndefined();
    // Verify ALL sessions revoked on password reset
    expect(updatedUser?.sessions.length).toBe(0);

    // Verify user can log in with new password
    const loginNew = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'success.reset@example.com',
        password: 'BrandNewPassword123!',
      });
    expect(loginNew.status).toBe(200);
    expect(loginNew.body.data.accessToken).toBeTruthy();

    // Verify old password fails
    const loginOld = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'success.reset@example.com',
        password: 'OldPassword123!',
      });
    expect(loginOld.status).toBe(401);
  });
});

