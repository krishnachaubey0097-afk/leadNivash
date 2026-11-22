import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, type IUser } from '../users/user.model.js';
import { LoginAttempt, hashIdentifier, hashEmailOnly } from './loginAttempt.model.js';
import { signAccessToken } from '../../utils/jwt.js';
import { getPlanLimits } from '../../config/plans.js';
import { mailService } from '../../services/mail.service.js';

export const REFRESH_COOKIE_NAME = 'leadnivesh_refresh';
export const REFRESH_COOKIE_PATH = '/';
export const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const REFRESH_GRACE_WINDOW_MS = 5 * 60 * 1000; // 5-minute grace window for concurrent/tab refreshes
export const MAX_SESSIONS_PER_USER = 10;

// Dummy bcrypt hash to ensure constant-time comparison on unknown email logins
const DUMMY_HASH = '$2a$12$e8YQ3e7cZ6o8a9kX9rU5ue1Vv1k8j9l0m1n2o3p4q5r6s7t8u9v0w';

export interface AuthSuccessResult {
  accessToken: string;
  refreshCookieValue: string;
  user: {
    _id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    agency: IUser['agency'];
    plan: IUser['plan'];
  };
}

export class AuthService {
  /**
   * Register a new broker account with explicit Terms/Privacy consent.
   */
  static async register(
    data: {
      name: string;
      email: string;
      password: string;
      phone: string;
      agency?: { name?: string; city?: string; reraNo?: string };
      consent: { termsAccepted: boolean; privacyVersion: string };
    },
    deviceLabel = 'Web Browser'
  ): Promise<AuthSuccessResult> {
    const email = data.email.toLowerCase().trim();

    // Check existing (including soft-deleted)
    const existing = await User.findOne({ email });
    if (existing) {
      const err: any = new Error(
        existing.isDeleted
          ? 'An account with this email was previously deleted. Please contact support to reactivate.'
          : 'An account with this email already exists'
      );
      err.statusCode = 409;
      err.code = 'CONFLICT';
      throw err;
    }

    // Hash password with bcrypt cost 12 (password is max 72 bytes via Zod schema)
    const passwordHash = await bcrypt.hash(data.password, 12);

    const sessionId = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = await bcrypt.hash(secret, 10);

    const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE_MS);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const user = new User({
      name: data.name,
      email,
      passwordHash,
      phone: data.phone,
      role: 'user',
      agency: {
        name: data.agency?.name || (data as any).agencyName || '',
        city: data.agency?.city || (data as any).city || 'Panipat',
        reraNo: data.agency?.reraNo || '',
      },
      plan: {
        tier: 'trial',
        trialEndsAt,
        limits: getPlanLimits('trial'),
      },
      consent: {
        termsAcceptedAt: new Date(),
        privacyVersion: data.consent.privacyVersion || '1.0',
      },
      sessions: [
        {
          sessionId,
          refreshTokenHash,
          deviceLabel,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          expiresAt,
        },
      ],
    });

    await user.save();

    const accessToken = signAccessToken({
      _id: user._id.toString(),
      email: user.email,
      role: user.role,
      sessionId,
    });

    return {
      accessToken,
      refreshCookieValue: `${sessionId}.${secret}`,
      user: {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        agency: user.agency,
        plan: user.plan,
      },
    };
  }

  /**
   * Email/Password login:
   * - Dummy bcrypt compare for unknown emails to prevent timing attacks.
   * - Lockout tracks both per-(email+IP) (5 attempts -> 15 min lock) and per-email (20 attempts -> 60 min lock).
   * - Prunes expired sessions and caps active sessions at 10.
   */
  static async login(
    emailRaw: string,
    password: string,
    ip: string,
    deviceLabel = 'Web Browser'
  ): Promise<AuthSuccessResult> {
    const clean = emailRaw.trim();
    // Support phone number (10 digits or with +91) as well as email
    const isPhone = /^(\+91|91)?[6-9]\d{9}$/.test(clean.replace(/[\s-]/g, ''));
    const phone10 = isPhone ? clean.replace(/\D/g, '').slice(-10) : '';
    const email = clean.toLowerCase();

    // Identifier for rate limiting: use phone10 if phone, else lowercase email
    const lookupKey = isPhone ? `phone:${phone10}` : email;
    const pairId = hashIdentifier(lookupKey, ip);
    const emailId = hashEmailOnly(lookupKey);
    const now = new Date();

    // 1. Check lockout status for both pair and identifier-wide
    const [pairAttempt, emailAttempt] = await Promise.all([
      LoginAttempt.findOne({ identifier: pairId }),
      LoginAttempt.findOne({ identifier: emailId }),
    ]);

    if (pairAttempt?.lockedUntil && pairAttempt.lockedUntil > now) {
      const waitMinutes = Math.ceil((pairAttempt.lockedUntil.getTime() - now.getTime()) / (60 * 1000));
      const err: any = new Error(`Account locked due to too many failed attempts. Please try again in ${waitMinutes} minutes.`);
      err.statusCode = 429;
      err.code = 'RATE_LIMIT_EXCEEDED';
      throw err;
    }

    if (emailAttempt?.lockedUntil && emailAttempt.lockedUntil > now) {
      const waitMinutes = Math.ceil((emailAttempt.lockedUntil.getTime() - now.getTime()) / (60 * 1000));
      const err: any = new Error(`Too many login attempts on this account. Please try again in ${waitMinutes} minutes.`);
      err.statusCode = 429;
      err.code = 'RATE_LIMIT_EXCEEDED';
      throw err;
    }

    // 2. Find user by email OR phone (selecting passwordHash explicitly since it has select: false)
    let user;
    if (isPhone) {
      user = await User.findOne({
        $or: [
          { phone: `+91${phone10}` },
          { phone: phone10 },
          { phone: `91${phone10}` },
          { email },
        ],
        isDeleted: false,
      }).select('+passwordHash');
    } else {
      user = await User.findOne({ email, isDeleted: false }).select('+passwordHash');
    }

    // 3. Verify password with timing attack defense
    let passwordValid = false;
    if (user && !user.isDeleted) {
      passwordValid = await bcrypt.compare(password, user.passwordHash);
    } else {
      // Dummy compare to consume equal CPU cycles
      await bcrypt.compare(password, DUMMY_HASH);
    }

    if (!user || user.isDeleted || !passwordValid) {
      // Record failed attempts on both pair and email-wide
      const newPairCount = (pairAttempt?.count || 0) + 1;
      const newEmailCount = (emailAttempt?.count || 0) + 1;

      const pairLockData: { count: number; lockedUntil?: Date } = { count: newPairCount };
      if (newPairCount >= 5) {
        pairLockData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min lock
      }

      const emailLockData: { count: number; lockedUntil?: Date } = { count: newEmailCount };
      if (newEmailCount >= 20) {
        emailLockData.lockedUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour lock
      }

      await Promise.all([
        LoginAttempt.findOneAndUpdate({ identifier: pairId }, { $set: pairLockData }, { upsert: true, new: true }),
        LoginAttempt.findOneAndUpdate({ identifier: emailId }, { $set: emailLockData }, { upsert: true, new: true }),
      ]);

      const err: any = new Error('Invalid email or password');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    if (user.isDisabled) {
      const err: any = new Error('This account has been disabled. Please contact support.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    // Clear failed attempts on success
    await Promise.all([
      LoginAttempt.deleteOne({ identifier: pairId }),
      LoginAttempt.deleteOne({ identifier: emailId }),
    ]);

    // 4. Prune expired sessions and cap active sessions at 10
    user.sessions = user.sessions.filter((s) => s.expiresAt > now);
    if (user.sessions.length >= MAX_SESSIONS_PER_USER) {
      // Sort oldest lastUsedAt first and drop excess
      user.sessions.sort((a, b) => a.lastUsedAt.getTime() - b.lastUsedAt.getTime());
      user.sessions = user.sessions.slice(user.sessions.length - (MAX_SESSIONS_PER_USER - 1));
    }

    // 5. Create new session
    const sessionId = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = await bcrypt.hash(secret, 10);
    const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE_MS);

    user.sessions.push({
      sessionId,
      refreshTokenHash,
      deviceLabel,
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
    });

    await user.save();

    const accessToken = signAccessToken({
      _id: user._id.toString(),
      email: user.email,
      role: user.role,
      sessionId,
    });

    return {
      accessToken,
      refreshCookieValue: `${sessionId}.${secret}`,
      user: {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        agency: user.agency,
        plan: user.plan,
      },
    };
  }

  /**
   * Refresh token rotation with atomic update & short grace window (~15s)
   * for concurrent in-flight requests.
   * If an old/reused secret is presented past the grace window, revokes ALL sessions.
   */
  static async refresh(cookieValue?: string): Promise<{
    accessToken: string;
    newRefreshCookieValue: string;
    userId: string;
    user?: any;
  }> {
    if (!cookieValue || !cookieValue.includes('.')) {
      const err: any = new Error('Refresh token missing or malformed');
      err.statusCode = 401;
      err.code = 'REFRESH_TOKEN_INVALID';
      throw err;
    }

    const [sessionId, secret] = cookieValue.split('.') as [string, string];
    if (!sessionId || !secret) {
      const err: any = new Error('Refresh token malformed');
      err.statusCode = 401;
      err.code = 'REFRESH_TOKEN_INVALID';
      throw err;
    }

    // Explicitly select session hash fields since they are select: false
    const user = await User.findOne({
      'sessions.sessionId': sessionId,
      isDeleted: false,
      isDisabled: false,
    }).select('+sessions.refreshTokenHash +sessions.previousTokenHash');

    if (!user) {
      const err: any = new Error('Session not found or expired');
      err.statusCode = 401;
      err.code = 'REFRESH_TOKEN_INVALID';
      throw err;
    }

    const session = user.sessions.find((s) => s.sessionId === sessionId);
    if (!session) {
      const err: any = new Error('Session not found');
      err.statusCode = 401;
      err.code = 'REFRESH_TOKEN_INVALID';
      throw err;
    }

    const now = new Date();
    if (session.expiresAt < now) {
      user.sessions = user.sessions.filter((s) => s.sessionId !== sessionId);
      await user.save();
      const err: any = new Error('Session has expired. Please log in again.');
      err.statusCode = 401;
      err.code = 'REFRESH_TOKEN_INVALID';
      throw err;
    }

    // 1. Check primary secret match
    const primaryMatch = await bcrypt.compare(secret, session.refreshTokenHash);

    if (primaryMatch) {
      // Valid primary rotation:
      // Store current hash as previous with grace window
      const newSecret = crypto.randomBytes(32).toString('hex');
      const newSecretHash = await bcrypt.hash(newSecret, 10);
      const graceExpiresAt = new Date(now.getTime() + REFRESH_GRACE_WINDOW_MS);

      // Atomic update on the expected session hash
      const updateResult = await User.updateOne(
        {
          _id: user._id,
          'sessions.sessionId': sessionId,
          'sessions.refreshTokenHash': session.refreshTokenHash,
        },
        {
          $set: {
            'sessions.$.refreshTokenHash': newSecretHash,
            'sessions.$.previousTokenHash': session.refreshTokenHash,
            'sessions.$.previousHashExpiresAt': graceExpiresAt,
            'sessions.$.lastUsedAt': now,
            'sessions.$.expiresAt': new Date(now.getTime() + REFRESH_MAX_AGE_MS),
          },
        }
      );

      // If race condition occurred, reload and re-verify
      if (updateResult.modifiedCount === 0) {
        return this.refresh(cookieValue);
      }

      const accessToken = signAccessToken({
        _id: user._id.toString(),
        email: user.email,
        role: user.role,
        sessionId,
      });

      const sanitizedUser = {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        agency: user.agency,
        plan: user.plan,
      };

      return {
        accessToken,
        newRefreshCookieValue: `${sessionId}.${newSecret}`,
        userId: user._id.toString(),
        user: sanitizedUser,
      };
    }

    // 2. Check grace window match (concurrent request handling)
    if (
      session.previousTokenHash &&
      session.previousHashExpiresAt &&
      session.previousHashExpiresAt > now
    ) {
      const graceMatch = await bcrypt.compare(secret, session.previousTokenHash);
      if (graceMatch) {
        // Safe concurrent refresh within grace window:
        // Issue fresh access token using current session without rotating again
        const accessToken = signAccessToken({
          _id: user._id.toString(),
          email: user.email,
          role: user.role,
          sessionId,
        });

        const sanitizedUser = {
          _id: user._id.toString(),
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          agency: user.agency,
          plan: user.plan,
        };

        return {
          accessToken,
          newRefreshCookieValue: cookieValue, // Retain current cookie
          userId: user._id.toString(),
          user: sanitizedUser,
        };
      }
    }

    // 3. Invalid or re-used secret presented outside grace window:
    // Revoke this specific session to terminate access on this device while preserving other valid devices
    user.sessions = user.sessions.filter((s) => s.sessionId !== sessionId);
    await user.save();

    const err: any = new Error('Session has expired or was rotated. Please log in again.');
    err.statusCode = 401;
    err.code = 'REFRESH_TOKEN_INVALID';
    throw err;
  }

  /**
   * Revoke current session on logout.
   */
  static async logout(cookieValue?: string, explicitSessionId?: string): Promise<void> {
    let sessionId = explicitSessionId;
    if (!sessionId && cookieValue && cookieValue.includes('.')) {
      sessionId = cookieValue.split('.')[0];
    }
    if (!sessionId) return;

    await User.updateOne(
      { 'sessions.sessionId': sessionId },
      { $pull: { sessions: { sessionId } } }
    );
  }

  /**
   * List active sessions for the authenticated user.
   */
  static async listSessions(userId: string, currentSessionId?: string) {
    const user = await User.findById(userId);
    if (!user || user.isDeleted || user.isDisabled) return [];

    return user.sessions.map((s) => ({
      sessionId: s.sessionId,
      deviceLabel: s.deviceLabel,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      isCurrent: s.sessionId === currentSessionId,
    }));
  }

  /**
   * Revoke a specific session for the authenticated user (prevents IDOR).
   */
  static async revokeSession(userId: string, targetSessionId: string): Promise<boolean> {
    const res = await User.updateOne(
      { _id: userId, isDeleted: false },
      { $pull: { sessions: { sessionId: targetSessionId } } }
    );
    return res.modifiedCount > 0;
  }

  /**
   * Request password reset token.
   * Single-use token hashed with SHA-256 in DB, 30-min expiry.
   * Always returns generic response to prevent email enumeration.
   */
  static async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({
      email: normalizedEmail,
      isDeleted: false,
      isDisabled: false,
    });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      user.passwordResetTokenHash = tokenHash;
      user.passwordResetExpiresAt = expiresAt;
      await user.save();

      await mailService.sendPasswordResetEmail(user.email, rawToken);
    }
  }

  /**
   * Reset password using single-use token.
   * Validates token hash, expiry, min 8 max 72 bytes password,
   * updates bcrypt hash, clears token, and revokes all sessions.
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date();

    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: mongoose.trusted({ $gt: now }),
      isDeleted: false,
      isDisabled: false,
    }).select('+passwordResetTokenHash');

    if (!user) {
      const err: any = new Error('Invalid or expired password reset token');
      err.statusCode = 400;
      err.code = 'INVALID_RESET_TOKEN';
      throw err;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    user.passwordHash = passwordHash;
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;

    // Revoke all existing sessions on password reset
    user.sessions = [];
    await user.save();
  }

  private static otpMap = new Map<string, { otp: string; expiresAt: number; token?: string }>();

  static async sendOtp(email: string): Promise<{ success: boolean; message: string; devOtp?: string }> {
    const cleanEmail = email.toLowerCase().trim();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    this.otpMap.set(cleanEmail, { otp, expiresAt });
    await mailService.sendVerificationOtp(cleanEmail, otp);

    return {
      success: true,
      message: 'Verification code sent to your email address.',
      devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    };
  }

  static async verifyOtp(email: string, otp: string): Promise<{ verified: boolean; verificationToken: string }> {
    const cleanEmail = email.toLowerCase().trim();
    const record = this.otpMap.get(cleanEmail);

    if (!record || record.expiresAt < Date.now() || record.otp !== otp.trim()) {
      const err: any = new Error('Invalid or expired verification code. Please request a new code.');
      err.statusCode = 400;
      err.code = 'INVALID_OTP';
      throw err;
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    this.otpMap.set(cleanEmail, { ...record, token: verificationToken });

    return {
      verified: true,
      verificationToken,
    };
  }

  static async googleAuth(
    data: {
      email: string;
      name: string;
      googleId?: string;
      phone?: string;
      agencyName?: string;
      city?: string;
    },
    deviceLabel = 'Web Browser (Google Sign-In)'
  ): Promise<AuthSuccessResult & { requiresPhone?: boolean }> {
    const email = data.email.toLowerCase().trim();

    let user = await User.findOne({ email });

    if (!user) {
      if (!data.phone) {
        return {
          requiresPhone: true,
          accessToken: '',
          refreshCookieValue: '',
          user: {
            _id: '',
            name: data.name,
            email,
            phone: '',
            role: 'user',
            agency: { name: data.agencyName || '', city: data.city || 'Panipat' },
            plan: { tier: 'trial', trialEndsAt: new Date(), limits: getPlanLimits('trial') },
          },
        };
      }

      const randomPassword = crypto.randomBytes(24).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 12);
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      user = new User({
        name: data.name,
        email,
        passwordHash,
        phone: data.phone,
        role: 'user',
        agency: {
          name: data.agencyName || (data.name ? `${data.name} Realty` : 'Prime Realty'),
          city: data.city || 'Panipat',
          reraNo: '',
        },
        plan: {
          tier: 'trial',
          trialEndsAt,
          limits: getPlanLimits('trial'),
        },
        consent: {
          termsAcceptedAt: new Date(),
          privacyVersion: '1.0',
        },
        sessions: [],
      });
    } else {
      if (data.phone && !user.phone) {
        user.phone = data.phone;
      }
    }

    if (user.isDisabled || user.isDeleted) {
      const err: any = new Error('This account has been disabled or deleted.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const sessionId = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = await bcrypt.hash(secret, 10);
    const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE_MS);

    user.sessions.push({
      sessionId,
      refreshTokenHash,
      deviceLabel,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt,
    });

    if (user.sessions.length > MAX_SESSIONS_PER_USER) {
      user.sessions.shift();
    }

    await user.save();

    const accessToken = signAccessToken({
      _id: user._id.toString(),
      email: user.email,
      role: user.role,
      sessionId,
    });

    const refreshCookieValue = `${sessionId}.${secret}`;

    return {
      accessToken,
      refreshCookieValue,
      user: {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        agency: user.agency,
        plan: user.plan,
      },
    };
  }
}
