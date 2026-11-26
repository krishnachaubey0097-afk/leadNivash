import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, type AuthProviderType, type IUser } from '../users/user.model.js';
import { LoginAttempt, hashIdentifier, hashEmailOnly } from './loginAttempt.model.js';
import { EmailOtp, type OtpPurpose } from './emailOtp.model.js';
import { AuthLoginLog, type AuthLogAction } from './authLoginLog.model.js';
import { signAccessToken } from '../../utils/jwt.js';
import { getPlanLimits, isPlanExpired } from '../../config/plans.js';
import { env } from '../../config/env.js';
import { mailService } from '../../services/mail.service.js';

export const REFRESH_COOKIE_NAME = 'leadnivesh_refresh';
export const REFRESH_COOKIE_PATH = '/';
export const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const REFRESH_GRACE_WINDOW_MS = 5 * 60 * 1000; // 5-minute grace window for concurrent/tab refreshes
export const MAX_SESSIONS_PER_USER = 10;

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_COOLDOWN_MS = 45 * 1000; // 45 seconds between resend requests
const OTP_MAX_ATTEMPTS = 5;

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
    preferences?: IUser['preferences'];
    plan: IUser['plan'];
    emailVerified?: boolean;
    hasPassword?: boolean;
    authProviders?: AuthProviderType[];
    hasGoogleLinked?: boolean;
    lastLoginAt?: Date;
    lastLoginMethod?: AuthProviderType;
  };
}

function hashOtp(email: string, otp: string): string {
  return crypto.createHash('sha256').update(`${email.toLowerCase().trim()}:${otp.trim()}`).digest('hex');
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function sanitizeUser(user: IUser) {
  const limits = getPlanLimits(user.plan?.tier || 'trial');
  const expired = user.plan ? isPlanExpired(user.plan as any) : false;
  return {
    _id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    agency: user.agency,
    preferences: user.preferences,
    plan: {
      ...(user.plan || { tier: 'trial', trialEndsAt: new Date() }),
      isExpired: expired,
      limits: user.plan?.limits || limits,
    } as any,
    emailVerified: Boolean(user.emailVerified),
    hasPassword: user.hasPassword !== false,
    authProviders: (Array.isArray(user.authProviders)
      ? user.authProviders
      : ['password']) as AuthProviderType[],
    hasGoogleLinked: Boolean(user.googleId),
    lastLoginAt: user.lastLoginAt,
    lastLoginMethod: user.lastLoginMethod,
  };
}

export class AuthService {
  private static async recordLoginAudit(params: {
    userId: string;
    email: string;
    method: AuthProviderType;
    action: AuthLogAction;
    ip?: string;
    userAgent?: string;
    sessionId?: string;
  }): Promise<void> {
    if (mongoose.connection.readyState !== 1) return;
    await AuthLoginLog.create(params).catch(() => {});
  }

  private static async issueSessionForUser(
    user: IUser,
    method: AuthProviderType,
    action: AuthLogAction,
    ip?: string,
    deviceLabel = 'Web Browser'
  ): Promise<AuthSuccessResult> {
    const now = new Date();
    const existingSessions = Array.isArray(user.sessions) ? user.sessions : [];
    user.sessions = existingSessions.filter((s) => !s.expiresAt || new Date(s.expiresAt) > now);

    if (user.sessions.length >= MAX_SESSIONS_PER_USER) {
      user.sessions.sort(
        (a, b) => new Date(a.lastUsedAt || 0).getTime() - new Date(b.lastUsedAt || 0).getTime()
      );
      user.sessions = user.sessions.slice(user.sessions.length - (MAX_SESSIONS_PER_USER - 1));
    }

    const sessionId = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = await bcrypt.hash(secret, 10);
    const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE_MS);

    user.sessions.push({
      sessionId,
      refreshTokenHash,
      deviceLabel,
      authMethod: method,
      ip,
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
    });

    const providers = new Set<AuthProviderType>(
      Array.isArray(user.authProviders) && user.authProviders.length > 0
        ? user.authProviders
        : ['password']
    );
    providers.add(method);
    user.authProviders = Array.from(providers);
    user.lastLoginAt = now;
    user.lastLoginMethod = method;

    await user.save();

    await this.recordLoginAudit({
      userId: user._id.toString(),
      email: user.email,
      method,
      action,
      ip,
      userAgent: deviceLabel,
      sessionId,
    });

    const accessToken = signAccessToken({
      _id: user._id.toString(),
      email: user.email,
      role: user.role,
      sessionId,
    });

    return {
      accessToken,
      refreshCookieValue: `${sessionId}.${secret}`,
      user: sanitizeUser(user),
    };
  }

  /**
   * Public provider capabilities for frontend dynamic Google / Email OTP activation.
   */
  static getProviders() {
    const googleClientId = env.GOOGLE_CLIENT_ID?.trim() || null;
    const smtpConfigured = mailService.isSmtpConfigured();
    return {
      googleEnabled: Boolean(googleClientId),
      googleClientId,
      emailOtpEnabled: smtpConfigured || env.NODE_ENV !== 'production',
      smtpConfigured,
      passwordEnabled: true,
    };
  }

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
    deviceLabel = 'Web Browser',
    ip?: string
  ): Promise<AuthSuccessResult> {
    const email = data.email.toLowerCase().trim();

    // Check existing (including soft-deleted)
    const existing = await User.findOne({ email });
    if (existing) {
      const err: any = new Error(
        existing.isDeleted
          ? 'An account with this email was previously deleted. Please contact support to reactivate.'
          : 'An account with this email already exists. Please sign in with your password, Google, or Email OTP.'
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

    const now = new Date();
    const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE_MS);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const user = new User({
      name: data.name,
      email,
      passwordHash,
      phone: data.phone,
      role: 'user',
      emailVerified: false,
      hasPassword: true,
      authProviders: ['password'],
      lastLoginAt: now,
      lastLoginMethod: 'password',
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
        termsAcceptedAt: now,
        privacyVersion: data.consent.privacyVersion || '1.0',
      },
      sessions: [
        {
          sessionId,
          refreshTokenHash,
          deviceLabel,
          authMethod: 'password',
          ip,
          createdAt: now,
          lastUsedAt: now,
          expiresAt,
        },
      ],
    });

    await user.save();

    await this.recordLoginAudit({
      userId: user._id.toString(),
      email: user.email,
      method: 'password',
      action: 'register',
      ip,
      userAgent: deviceLabel,
      sessionId,
    });

    const accessToken = signAccessToken({
      _id: user._id.toString(),
      email: user.email,
      role: user.role,
      sessionId,
    });

    return {
      accessToken,
      refreshCookieValue: `${sessionId}.${secret}`,
      user: sanitizeUser(user),
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
    const isPhone = /^(\+91|91)?[6-9]\d{9}$/.test(clean.replace(/[\s-]/g, ''));
    const phone10 = isPhone ? clean.replace(/\D/g, '').slice(-10) : '';
    const email = clean.toLowerCase();

    const lookupKey = isPhone ? `phone:${phone10}` : email;
    const pairId = hashIdentifier(lookupKey, ip);
    const emailId = hashEmailOnly(lookupKey);
    const now = new Date();

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

    let passwordValid = false;
    if (user && !user.isDeleted) {
      passwordValid = await bcrypt.compare(password, user.passwordHash);
    } else {
      await bcrypt.compare(password, DUMMY_HASH);
    }

    if (!user || user.isDeleted || !passwordValid) {
      const newPairCount = (pairAttempt?.count || 0) + 1;
      const newEmailCount = (emailAttempt?.count || 0) + 1;

      const pairLockData: { count: number; lockedUntil?: Date } = { count: newPairCount };
      if (newPairCount >= 5) {
        pairLockData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      const emailLockData: { count: number; lockedUntil?: Date } = { count: newEmailCount };
      if (newEmailCount >= 20) {
        emailLockData.lockedUntil = new Date(Date.now() + 60 * 60 * 1000);
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

    await Promise.all([
      LoginAttempt.deleteOne({ identifier: pairId }),
      LoginAttempt.deleteOne({ identifier: emailId }),
    ]);

    return this.issueSessionForUser(user, 'password', 'login', ip, deviceLabel);
  }

  /**
   * Refresh token rotation with atomic update & short grace window.
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

    const primaryMatch = await bcrypt.compare(secret, session.refreshTokenHash);

    if (primaryMatch) {
      const newSecret = crypto.randomBytes(32).toString('hex');
      const newSecretHash = await bcrypt.hash(newSecret, 10);
      const graceExpiresAt = new Date(now.getTime() + REFRESH_GRACE_WINDOW_MS);

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

      if (updateResult.modifiedCount === 0) {
        return this.refresh(cookieValue);
      }

      const accessToken = signAccessToken({
        _id: user._id.toString(),
        email: user.email,
        role: user.role,
        sessionId,
      });

      return {
        accessToken,
        newRefreshCookieValue: `${sessionId}.${newSecret}`,
        userId: user._id.toString(),
        user: sanitizeUser(user),
      };
    }

    if (
      session.previousTokenHash &&
      session.previousHashExpiresAt &&
      session.previousHashExpiresAt > now
    ) {
      const graceMatch = await bcrypt.compare(secret, session.previousTokenHash);
      if (graceMatch) {
        const accessToken = signAccessToken({
          _id: user._id.toString(),
          email: user.email,
          role: user.role,
          sessionId,
        });

        return {
          accessToken,
          newRefreshCookieValue: cookieValue,
          userId: user._id.toString(),
          user: sanitizeUser(user),
        };
      }
    }

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
      authMethod: s.authMethod || 'password',
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
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      user.passwordResetTokenHash = tokenHash;
      user.passwordResetExpiresAt = expiresAt;
      await user.save();

      await mailService.sendPasswordResetEmail(user.email, rawToken);
    }
  }

  /**
   * Reset password using single-use token.
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
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
    user.hasPassword = true;
    const providers = new Set<AuthProviderType>(
      Array.isArray(user.authProviders) ? user.authProviders : []
    );
    providers.add('password');
    user.authProviders = Array.from(providers);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;

    // Revoke all existing sessions on password reset
    user.sessions = [];
    await user.save();
  }

  /**
   * Send a 6-digit OTP stored hashed in MongoDB (TTL 10 min, 45s cooldown).
   */
  static async sendOtp(
    emailRaw: string,
    purpose: OtpPurpose = 'login',
    ip?: string
  ): Promise<{
    success: boolean;
    message: string;
    accountExists: boolean;
    deliveryMode: 'smtp' | 'dev_preview';
    devOtp?: string;
  }> {
    const cleanEmail = emailRaw.toLowerCase().trim();
    const existing = await User.findOne({ email: cleanEmail });

    if (existing?.isDeleted) {
      const err: any = new Error('An account with this email was deleted. Please contact support.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }
    if (existing?.isDisabled) {
      const err: any = new Error('This account has been disabled. Please contact support.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (purpose === 'login' && !existing) {
      const err: any = new Error('No broker account found with this email. Please create an account first.');
      err.statusCode = 404;
      err.code = 'ACCOUNT_NOT_FOUND';
      throw err;
    }

    if (purpose === 'register' && existing) {
      const err: any = new Error(
        'An account with this email already exists. Sign in with Password, Google, or Email OTP.'
      );
      err.statusCode = 409;
      err.code = 'CONFLICT';
      throw err;
    }

    const now = new Date();
    const existingOtp = await EmailOtp.findOne({ email: cleanEmail, purpose });
    if (
      existingOtp &&
      existingOtp.expiresAt > now &&
      now.getTime() - new Date(existingOtp.updatedAt).getTime() < OTP_COOLDOWN_MS &&
      env.NODE_ENV !== 'test'
    ) {
      const waitSec = Math.ceil(
        (OTP_COOLDOWN_MS - (now.getTime() - new Date(existingOtp.updatedAt).getTime())) / 1000
      );
      const err: any = new Error(`Please wait ${waitSec} seconds before requesting another OTP code.`);
      err.statusCode = 429;
      err.code = 'RATE_LIMIT_EXCEEDED';
      throw err;
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = hashOtp(cleanEmail, otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await EmailOtp.findOneAndUpdate(
      { email: cleanEmail, purpose },
      {
        $set: {
          email: cleanEmail,
          purpose,
          otpHash,
          attempts: 0,
          expiresAt,
          verifiedAt: undefined,
          verificationTokenHash: undefined,
          ip,
        },
      },
      { upsert: true, new: true }
    );

    const delivery = await mailService.sendVerificationOtp(cleanEmail, otp, purpose);

    return {
      success: true,
      message:
        delivery.mode === 'smtp'
          ? `6-digit verification code sent to ${cleanEmail}.`
          : `Verification code generated for ${cleanEmail}.`,
      accountExists: Boolean(existing),
      deliveryMode: delivery.mode,
      devOtp: env.NODE_ENV !== 'production' && !delivery.delivered ? otp : undefined,
    };
  }

  /**
   * Verify 6-digit OTP (or onboarding verificationToken) from MongoDB:
   * - Existing users receive real accessToken + MongoDB session + HttpOnly refresh cookie.
   * - New users without phone/name yet receive { verified: true, requiresOnboarding: true, verificationToken }.
   * - New users providing name + phone + consent are created in MongoDB immediately.
   */
  static async verifyOtp(
    data: {
      email: string;
      otp?: string;
      verificationToken?: string;
      purpose?: OtpPurpose;
      name?: string;
      phone?: string;
      password?: string;
      agencyName?: string;
      city?: string;
      agency?: { name?: string; city?: string; reraNo?: string };
      consent?: { termsAccepted: boolean; privacyVersion: string };
    },
    ip?: string,
    deviceLabel = 'Web Browser (Email OTP)'
  ): Promise<
    | (AuthSuccessResult & { verified: true; requiresOnboarding?: false })
    | { verified: true; requiresOnboarding: true; verificationToken: string; email: string }
  > {
    const cleanEmail = data.email.toLowerCase().trim();
    const purpose: OtpPurpose = data.purpose || 'login';
    const now = new Date();

    const record = await EmailOtp.findOne({
      email: cleanEmail,
      purpose,
    });

    if (!record || record.expiresAt < now) {
      const err: any = new Error('Invalid or expired verification code. Please request a new code.');
      err.statusCode = 400;
      err.code = 'INVALID_OTP';
      throw err;
    }

    if (data.verificationToken) {
      const providedTokenHash = hashToken(data.verificationToken);
      if (!record.verifiedAt || record.verificationTokenHash !== providedTokenHash) {
        const err: any = new Error('OTP session expired. Please request a fresh verification code.');
        err.statusCode = 400;
        err.code = 'INVALID_OTP';
        throw err;
      }
    } else {
      if (record.attempts >= OTP_MAX_ATTEMPTS) {
        await EmailOtp.deleteOne({ _id: record._id });
        const err: any = new Error('Too many wrong OTP attempts. Please request a new verification code.');
        err.statusCode = 429;
        err.code = 'OTP_MAX_ATTEMPTS';
        throw err;
      }

      const expectedHash = hashOtp(cleanEmail, data.otp || '');
      const match = crypto.timingSafeEqual(
        Buffer.from(record.otpHash, 'hex'),
        Buffer.from(expectedHash, 'hex')
      );

      if (!match) {
        record.attempts += 1;
        await record.save();
        const err: any = new Error('Invalid or expired verification code. Please try again.');
        err.statusCode = 400;
        err.code = 'INVALID_OTP';
        throw err;
      }

      record.verifiedAt = now;
    }

    let user = await User.findOne({ email: cleanEmail });

    if (user?.isDeleted || user?.isDisabled) {
      const err: any = new Error('This account has been disabled or deleted.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (user) {
      user.emailVerified = true;
      await EmailOtp.deleteOne({ _id: record._id });
      const authResult = await this.issueSessionForUser(
        user,
        'email_otp',
        'login',
        ip,
        deviceLabel
      );
      return { verified: true, ...authResult };
    }

    // New user via Email OTP
    if (!data.phone || !data.name) {
      const rawVerifToken = crypto.randomBytes(32).toString('hex');
      record.verificationTokenHash = hashToken(rawVerifToken);
      // Extend TTL briefly (15 min) so user can finish profile step comfortably
      record.expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await record.save();

      return {
        verified: true,
        requiresOnboarding: true,
        verificationToken: rawVerifToken,
        email: cleanEmail,
      };
    }

    if (data.consent && data.consent.termsAccepted === false) {
      const err: any = new Error('You must accept the Terms and Privacy Policy to register.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const hasPwd = Boolean(data.password && data.password.length >= 8);
    const rawSecret = hasPwd ? data.password! : crypto.randomBytes(24).toString('hex');
    const passwordHash = await bcrypt.hash(rawSecret, 12);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    user = new User({
      name: data.name.trim(),
      email: cleanEmail,
      passwordHash,
      phone: data.phone.trim(),
      role: 'user',
      emailVerified: true,
      hasPassword: hasPwd,
      authProviders: hasPwd ? ['password', 'email_otp'] : ['email_otp'],
      agency: {
        name: data.agency?.name || data.agencyName || `${data.name.trim()} Realty`,
        city: data.agency?.city || data.city || 'Panipat',
        reraNo: data.agency?.reraNo || '',
      },
      plan: {
        tier: 'trial',
        trialEndsAt,
        limits: getPlanLimits('trial'),
      },
      consent: {
        termsAcceptedAt: now,
        privacyVersion: data.consent?.privacyVersion || '1.0',
      },
      sessions: [],
    });

    await EmailOtp.deleteOne({ _id: record._id });

    const authResult = await this.issueSessionForUser(
      user,
      'email_otp',
      'register',
      ip,
      deviceLabel
    );
    return { verified: true, ...authResult };
  }

  /**
   * Verify real Google credential / accessToken with Google's OAuth endpoints.
   */
  private static async resolveGoogleIdentity(data: {
    credential?: string;
    accessToken?: string;
    email?: string;
    name?: string;
    googleId?: string;
  }): Promise<{ email: string; name: string; googleId: string }> {
    if (data.credential) {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(data.credential)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) {
        const err: any = new Error('Google ID token verification failed.');
        err.statusCode = 401;
        err.code = 'INVALID_GOOGLE_TOKEN';
        throw err;
      }
      const payload = (await res.json()) as any;
      if (
        env.GOOGLE_CLIENT_ID &&
        payload.aud &&
        payload.aud !== env.GOOGLE_CLIENT_ID
      ) {
        const err: any = new Error('Google token audience mismatch.');
        err.statusCode = 401;
        err.code = 'INVALID_GOOGLE_TOKEN';
        throw err;
      }
      if (!payload.email || (payload.email_verified !== 'true' && payload.email_verified !== true)) {
        const err: any = new Error('Google account email is not verified.');
        err.statusCode = 401;
        err.code = 'INVALID_GOOGLE_TOKEN';
        throw err;
      }
      return {
        email: String(payload.email).toLowerCase().trim(),
        name: String(payload.name || data.name || payload.email.split('@')[0]).trim(),
        googleId: String(payload.sub || data.googleId || ''),
      };
    }

    if (data.accessToken) {
      const [userInfoRes, tokenInfoRes] = await Promise.all([
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${data.accessToken}` },
          signal: AbortSignal.timeout(8000),
        }),
        env.GOOGLE_CLIENT_ID
          ? fetch(
              `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(data.accessToken)}`,
              { signal: AbortSignal.timeout(8000) }
            )
          : Promise.resolve(null),
      ]);

      if (!userInfoRes.ok) {
        const err: any = new Error('Google access token verification failed.');
        err.statusCode = 401;
        err.code = 'INVALID_GOOGLE_TOKEN';
        throw err;
      }

      if (tokenInfoRes) {
        if (!tokenInfoRes.ok) {
          const err: any = new Error('Google OAuth token validation failed.');
          err.statusCode = 401;
          err.code = 'INVALID_GOOGLE_TOKEN';
          throw err;
        }
        const tokenInfo = (await tokenInfoRes.json()) as any;
        const audMatch =
          tokenInfo.aud === env.GOOGLE_CLIENT_ID || tokenInfo.azp === env.GOOGLE_CLIENT_ID;
        if (!audMatch) {
          const err: any = new Error('Google OAuth token client mismatch.');
          err.statusCode = 401;
          err.code = 'INVALID_GOOGLE_TOKEN';
          throw err;
        }
      }

      const profile = (await userInfoRes.json()) as any;
      if (!profile.email || profile.email_verified === false) {
        const err: any = new Error('Google account email is missing or unverified.');
        err.statusCode = 401;
        err.code = 'INVALID_GOOGLE_TOKEN';
        throw err;
      }

      return {
        email: String(profile.email).toLowerCase().trim(),
        name: String(profile.name || data.name || profile.email.split('@')[0]).trim(),
        googleId: String(profile.sub || data.googleId || ''),
      };
    }

    // Production guard: require real Google token whenever configured or in production
    if (env.NODE_ENV === 'production' || Boolean(env.GOOGLE_CLIENT_ID)) {
      const err: any = new Error('Google sign-in requires a valid Google authorization token.');
      err.statusCode = 401;
      err.code = 'GOOGLE_TOKEN_REQUIRED';
      throw err;
    }

    if (!data.email) {
      const err: any = new Error('Google email or credential is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    return {
      email: data.email.toLowerCase().trim(),
      name: (data.name || data.email.split('@')[0] || 'Broker Partner').trim(),
      googleId: data.googleId || '',
    };
  }

  static async googleAuth(
    data: {
      credential?: string;
      accessToken?: string;
      email?: string;
      name?: string;
      googleId?: string;
      phone?: string;
      agencyName?: string;
      city?: string;
      agency?: { name?: string; city?: string; reraNo?: string };
      consent?: { termsAccepted: boolean; privacyVersion: string };
    },
    deviceLabel = 'Web Browser (Google Sign-In)',
    ip?: string
  ): Promise<AuthSuccessResult & { requiresPhone?: boolean }> {
    const identity = await this.resolveGoogleIdentity(data);
    const { email, name, googleId } = identity;

    const query: any = googleId
      ? { $or: [{ googleId }, { email }] }
      : { email };

    let user = await User.findOne(query);

    if (user?.isDisabled || user?.isDeleted) {
      const err: any = new Error('This account has been disabled or deleted.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (!user) {
      if (!data.phone) {
        return {
          requiresPhone: true,
          accessToken: '',
          refreshCookieValue: '',
          user: {
            _id: '',
            name,
            email,
            phone: '',
            role: 'user',
            agency: { name: data.agency?.name || data.agencyName || '', city: data.agency?.city || data.city || 'Panipat' },
            plan: { tier: 'trial', trialEndsAt: new Date(), limits: getPlanLimits('trial') },
            emailVerified: true,
            hasPassword: false,
            authProviders: ['google'],
            hasGoogleLinked: true,
          },
        };
      }

      const randomPassword = crypto.randomBytes(24).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 12);
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      user = new User({
        name,
        email,
        passwordHash,
        phone: data.phone.trim(),
        role: 'user',
        googleId: googleId || undefined,
        emailVerified: true,
        hasPassword: false,
        authProviders: ['google'],
        agency: {
          name: data.agency?.name || data.agencyName || (name ? `${name} Realty` : 'Prime Realty'),
          city: data.agency?.city || data.city || 'Panipat',
          reraNo: data.agency?.reraNo || '',
        },
        plan: {
          tier: 'trial',
          trialEndsAt,
          limits: getPlanLimits('trial'),
        },
        consent: {
          termsAcceptedAt: new Date(),
          privacyVersion: data.consent?.privacyVersion || '1.0',
        },
        sessions: [],
      });

      return this.issueSessionForUser(user, 'google', 'register', ip, deviceLabel);
    }

    // Existing account: link Google ID & verified email seamlessly
    const wasAlreadyLinked = Boolean(user.googleId);
    if (googleId && !user.googleId) {
      user.googleId = googleId;
    }
    user.emailVerified = true;
    if (data.phone && !user.phone) {
      user.phone = data.phone.trim();
    }

    return this.issueSessionForUser(
      user,
      'google',
      wasAlreadyLinked ? 'login' : 'link_provider',
      ip,
      deviceLabel
    );
  }
}
