import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { User } from '../src/modules/users/user.model.js';
import { LoginAttempt } from '../src/modules/auth/loginAttempt.model.js';

describe('AuthService & Security Invariants', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Password Hashing Invariant', () => {
    it('hashes passwords using bcrypt with cost >= 10 and never stores plain text', async () => {
      let savedUser: any = null;
      vi.spyOn(User, 'findOne').mockResolvedValue(null as any);
      vi.spyOn(User.prototype, 'save').mockImplementation(function (this: any) {
        savedUser = this;
        return Promise.resolve(this);
      });

      const plainPassword = 'SuperSecretPassword123';
      const result = await AuthService.register({
        name: 'Rajesh Sharma',
        email: 'rajesh@example.com',
        password: plainPassword,
        phone: '+919876543210',
        consent: { termsAccepted: true, privacyVersion: '1.0' },
      });

      expect(result.accessToken).toBeDefined();
      expect(savedUser).toBeDefined();
      expect(savedUser.passwordHash).not.toBe(plainPassword);

      // Verify that bcrypt can decrypt/compare with the plain password
      const isMatch = await bcrypt.compare(plainPassword, savedUser.passwordHash);
      expect(isMatch).toBe(true);

      // Bcrypt hash prefix $2a$12$ or $2b$12$ confirms cost factor >= 10
      const rounds = parseInt(savedUser.passwordHash.split('$')[2] || '0', 10);
      expect(rounds).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Account Lockout (5 failed attempts -> 15 min lock)', () => {
    it('locks account after 5 failed login attempts', async () => {
      const email = 'lockout-test@example.com';
      const ip = '192.168.1.100';

      // Mock user exists
      const passwordHash = await bcrypt.hash('CorrectPassword123', 10);
      const mockUser: any = {
        _id: '64a1b2c3d4e5f6a7b8c9d0e1',
        email,
        passwordHash,
        isDisabled: false,
        isDeleted: false,
        sessions: [],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);

      // Attempts 1 to 4 should throw 401 UNAUTHORIZED
      let currentAttemptCount = 0;
      vi.spyOn(LoginAttempt, 'findOne').mockImplementation((() =>
        Promise.resolve(
          currentAttemptCount > 0
            ? ({ count: currentAttemptCount, identifier: 'mock-id' } as any)
            : null
        )) as any);

      vi.spyOn(LoginAttempt, 'findOneAndUpdate').mockImplementation(
        ((_filter: any, update: any) => {
          currentAttemptCount = update.$set.count;
          return Promise.resolve({ count: currentAttemptCount } as any);
        }) as any
      );

      for (let i = 1; i <= 4; i++) {
        await expect(
          AuthService.login(email, 'WrongPassword', ip)
        ).rejects.toMatchObject({
          statusCode: 401,
          code: 'UNAUTHORIZED',
        });
      }

      // 5th attempt triggers lockout
      let recordedLockUntil: Date | undefined;
      vi.spyOn(LoginAttempt, 'findOneAndUpdate').mockImplementation(
        ((_filter: any, update: any) => {
          if (update.$set.lockedUntil) {
            recordedLockUntil = update.$set.lockedUntil;
          }
          return Promise.resolve({
            count: update.$set.count || 5,
            lockedUntil: update.$set.lockedUntil,
          } as any);
        }) as any
      );

      await expect(
        AuthService.login(email, 'WrongPassword', ip)
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      });

      expect(recordedLockUntil).toBeDefined();
      expect(recordedLockUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);

      // Next attempt while locked returns 429 RATE_LIMIT_EXCEEDED
      vi.spyOn(LoginAttempt, 'findOne').mockResolvedValue({
        count: 5,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000), // 10 mins remaining
      } as any);

      await expect(
        AuthService.login(email, 'CorrectPassword123', ip)
      ).rejects.toMatchObject({
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
      });
    });
  });

  describe('Refresh Token Rotation, Grace Window & Reuse Detection', () => {
    it('rotates secret on successful refresh and updates session hash', async () => {
      const sessionId = 'sess_valid_123';
      const secret = 'original_valid_secret';
      const refreshTokenHash = await bcrypt.hash(secret, 10);

      const mockSession = {
        sessionId,
        refreshTokenHash,
        expiresAt: new Date(Date.now() + 100000),
        lastUsedAt: new Date(),
      };

      const mockUser: any = {
        _id: '64a1b2c3d4e5f6a7b8c9d0e1',
        email: 'refresh@example.com',
        role: 'user',
        isDeleted: false,
        isDisabled: false,
        sessions: [mockSession],
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);
      vi.spyOn(User, 'updateOne').mockResolvedValue({ modifiedCount: 1 } as any);

      const result = await AuthService.refresh(`${sessionId}.${secret}`);

      expect(result.accessToken).toBeDefined();
      expect(result.newRefreshCookieValue).toBeDefined();
      expect(result.newRefreshCookieValue).not.toBe(`${sessionId}.${secret}`);
    });

    it('grace window allows concurrent in-flight requests with previous secret without breach revoke', async () => {
      const sessionId = 'sess_grace_window';
      const previousSecret = 'previous_secret_still_in_flight';
      const currentSecret = 'new_secret_already_rotated';

      const previousTokenHash = await bcrypt.hash(previousSecret, 10);
      const currentTokenHash = await bcrypt.hash(currentSecret, 10);

      const mockSession = {
        sessionId,
        refreshTokenHash: currentTokenHash,
        previousTokenHash,
        previousHashExpiresAt: new Date(Date.now() + 10000), // Valid for 10 more seconds
        expiresAt: new Date(Date.now() + 100000),
      };

      const mockUser: any = {
        _id: '64a1b2c3d4e5f6a7b8c9d0e1',
        email: 'grace@example.com',
        role: 'user',
        isDeleted: false,
        isDisabled: false,
        sessions: [mockSession],
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);

      // Present the previous secret (within grace window)
      const result = await AuthService.refresh(`${sessionId}.${previousSecret}`);

      // Succeeds and does NOT revoke sessions!
      expect(result.accessToken).toBeDefined();
      expect(mockUser.sessions.length).toBe(1);
    });

    it('BREACH SIGNAL: revokes ALL user sessions if an old secret is presented outside grace window', async () => {
      const sessionId = 'sess_compromised';
      const storedActiveSecret = 'new_rotated_secret_in_db';
      const reusedOldSecret = 'old_reused_stolen_secret';

      const refreshTokenHash = await bcrypt.hash(storedActiveSecret, 10);

      const mockUser: any = {
        _id: '64a1b2c3d4e5f6a7b8c9d0e1',
        email: 'victim@example.com',
        role: 'user',
        isDeleted: false,
        isDisabled: false,
        sessions: [
          { sessionId, refreshTokenHash, expiresAt: new Date(Date.now() + 100000) },
          { sessionId: 'sess_phone', refreshTokenHash: 'hash2', expiresAt: new Date(Date.now() + 100000) },
          { sessionId: 'sess_laptop', refreshTokenHash: 'hash3', expiresAt: new Date(Date.now() + 100000) },
        ],
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);

      // Present the old reused secret
      await expect(
        AuthService.refresh(`${sessionId}.${reusedOldSecret}`)
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'REFRESH_TOKEN_INVALID',
      });

      // Verification: ALL 3 sessions are wiped out (revoked) to protect the account
      expect(mockUser.sessions).toEqual([]);
      expect(mockUser.save).toHaveBeenCalled();
    });
  });

  describe('Session Management & IDOR Prevention', () => {
    it('scopes session revocation strictly to the authenticated user ID', async () => {
      const updateOneSpy = vi.spyOn(User, 'updateOne').mockResolvedValue({ modifiedCount: 1 } as any);

      const userId = '64a1b2c3d4e5f6a7b8c9d0e1';
      const targetSessionId = 'sess_target_123';

      await AuthService.revokeSession(userId, targetSessionId);

      // Query MUST match _id: userId to prevent IDOR
      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: userId, isDeleted: false },
        { $pull: { sessions: { sessionId: targetSessionId } } }
      );
    });
  });
});
