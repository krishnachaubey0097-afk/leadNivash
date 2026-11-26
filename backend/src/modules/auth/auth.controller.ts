import type { Request, Response, NextFunction } from 'express';
import {
  AuthService,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  REFRESH_MAX_AGE_MS,
} from './auth.service.js';
import { env } from '../../config/env.js';
import { verifyAccessToken } from '../../utils/jwt.js';

function setRefreshCookie(res: Response, value: string): void {
  const isProd = env.NODE_ENV === 'production';
  const isSecure = isProd || Boolean(res.req?.secure || res.req?.headers?.['x-forwarded-proto'] === 'https');
  const sameSite = env.NODE_ENV === 'test' ? 'strict' : (isSecure ? 'none' : 'lax');

  // Secure HTTP-only refresh token cookie with root path & 30-day persistence
  res.cookie(REFRESH_COOKIE_NAME, value, {
    httpOnly: true,
    secure: isSecure,
    sameSite,
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_MAX_AGE_MS,
  });

  // Client-readable session indicator cookie (allows frontend to hydrate session immediately on boot)
  res.cookie('leadnivesh_logged_in', 'true', {
    httpOnly: false,
    secure: isSecure,
    sameSite,
    path: '/',
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  const isProd = env.NODE_ENV === 'production';
  const isSecure = isProd || Boolean(res.req?.secure || res.req?.headers?.['x-forwarded-proto'] === 'https');
  const sameSite = env.NODE_ENV === 'test' ? 'strict' : (isSecure ? 'none' : 'lax');

  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecure,
    sameSite,
    path: REFRESH_COOKIE_PATH,
  });

  // Also clear legacy subpath cookie if client still has it in storage
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecure,
    sameSite,
    path: '/api/v1/auth',
  });

  res.clearCookie('leadnivesh_logged_in', {
    httpOnly: false,
    secure: isSecure,
    sameSite,
    path: '/',
  });
}

export class AuthController {
  static getProviders(_req: Request, res: Response): void {
    res.status(200).json({
      success: true,
      data: AuthService.getProviders(),
    });
  }

  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const deviceLabel = req.headers['user-agent'] || 'Web Browser';
      const result = await AuthService.register(req.body, deviceLabel, ip);

      setRefreshCookie(res, result.refreshCookieValue);

      res.status(201).json({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const deviceLabel = req.headers['user-agent'] || 'Web Browser';
      const result = await AuthService.login(req.body.email, req.body.password, ip, deviceLabel);

      setRefreshCookie(res, result.refreshCookieValue);

      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cookieValue = req.cookies?.[REFRESH_COOKIE_NAME];
      const result = await AuthService.refresh(cookieValue);

      setRefreshCookie(res, result.newRefreshCookieValue);

      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: (result as any).user,
        },
      });
    } catch (err) {
      clearRefreshCookie(res);
      next(err);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cookieValue = req.cookies?.[REFRESH_COOKIE_NAME];
      let sessionIdFromToken: string | undefined;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        if (token) {
          try {
            const payload = verifyAccessToken(token);
            sessionIdFromToken = payload.sessionId;
          } catch {
            // Token expired or invalid, continue with cookie invalidation
          }
        }
      }

      await AuthService.logout(cookieValue, sessionIdFromToken);
      clearRefreshCookie(res);

      res.status(200).json({
        success: true,
        data: {
          message: 'Logged out successfully',
        },
      });
    } catch (err) {
      clearRefreshCookie(res);
      next(err);
    }
  }

  static async listSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const currentSessionId = req.user?.sessionId;
      const sessions = await AuthService.listSessions(userId, currentSessionId);

      res.status(200).json({
        success: true,
        data: sessions,
      });
    } catch (err) {
      next(err);
    }
  }

  static async revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const targetSessionId = req.params.id as string;
      const revoked = await AuthService.revokeSession(userId, targetSessionId);

      if (!revoked) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found or already revoked',
          },
        });
        return;
      }

      // If user revoked their current session, clear cookie
      if (targetSessionId === req.user?.sessionId) {
        clearRefreshCookie(res);
      }

      res.status(200).json({
        success: true,
        data: {
          message: 'Session revoked successfully',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await AuthService.forgotPassword(req.body.email);
      res.status(200).json({
        success: true,
        data: {
          message: 'If that email exists in our system, a password reset link has been sent.',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await AuthService.resetPassword(req.body.token, req.body.newPassword);
      clearRefreshCookie(res);
      res.status(200).json({
        success: true,
        data: {
          message: 'Password has been reset successfully. Please log in with your new password.',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async sendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, purpose } = req.body;
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const result = await AuthService.sendOtp(email, purpose, ip);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const deviceLabel = req.headers['user-agent'] || 'Web Browser (Email OTP)';
      const result = await AuthService.verifyOtp(req.body, ip, deviceLabel);

      if ('accessToken' in result && result.accessToken) {
        setRefreshCookie(res, result.refreshCookieValue);
        res.status(200).json({
          success: true,
          data: {
            verified: true,
            accessToken: result.accessToken,
            user: result.user,
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async googleAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const deviceLabel = req.headers['user-agent'] || 'Web Browser (Google Sign-In)';
      const result = await AuthService.googleAuth(req.body, deviceLabel, ip);
      if (result.requiresPhone) {
        res.status(200).json({
          success: true,
          data: {
            requiresPhone: true,
            user: result.user,
          },
        });
        return;
      }

      setRefreshCookie(res, result.refreshCookieValue);
      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

