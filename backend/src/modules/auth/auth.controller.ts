import type { Request, Response, NextFunction } from 'express';
import {
  AuthService,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  REFRESH_MAX_AGE_MS,
} from './auth.service.js';
import { env } from '../../config/env.js';

function setRefreshCookie(res: Response, value: string): void {
  res.cookie(REFRESH_COOKIE_NAME, value, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  });
}

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deviceLabel = req.headers['user-agent'] || 'Web Browser';
      const result = await AuthService.register(req.body, deviceLabel);

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
      await AuthService.logout(cookieValue);
      clearRefreshCookie(res);

      res.status(200).json({
        success: true,
        data: {
          message: 'Logged out successfully',
        },
      });
    } catch (err) {
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
}

