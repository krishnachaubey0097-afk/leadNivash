import type { Request, Response, NextFunction } from 'express';
import { ShareService } from './share.service.js';

export class ShareController {
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const propertyId = req.params.id as string;
      const template = req.body?.template || 'flyer';

      const result = await ShareService.createShareLink(userId, propertyId, template);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const shareId = req.params.id as string;

      await ShareService.revokeShareLink(userId, shareId);

      res.status(200).json({
        success: true,
        data: { message: 'Share link revoked successfully' },
      });
    } catch (err) {
      next(err);
    }
  }
}

