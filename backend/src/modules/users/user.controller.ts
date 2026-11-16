import type { Request, Response, NextFunction } from 'express';
import { UserService } from './user.service.js';
import { MediaService } from '../../services/media.service.js';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from '../auth/auth.service.js';
import { env } from '../../config/env.js';

export class UserController {
  static async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await UserService.getMe(req.user!._id);
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await UserService.updateMe(req.user!._id, req.body);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async signLogoUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const uploadParams = MediaService.getSignedLogoUploadParams(req.user!._id);
      res.status(200).json({
        success: true,
        data: uploadParams,
      });
    } catch (err) {
      next(err);
    }
  }

  static async exportData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await UserService.exportUserData(req.user!._id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await UserService.deleteAccount(req.user!._id, req.body.confirmText);

      // Clear refresh cookie on account deletion
      res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: REFRESH_COOKIE_PATH,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

