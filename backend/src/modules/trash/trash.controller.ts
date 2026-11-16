import type { Request, Response, NextFunction } from 'express';
import { TrashService } from './trash.service.js';

export class TrashController {
  static async listTrash(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const items = await TrashService.listTrash(userId);

      res.status(200).json({
        success: true,
        data: items,
      });
    } catch (err) {
      next(err);
    }
  }

  static async restore(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const type = req.params.type as 'property' | 'buyer' | 'deal';
      const id = req.params.id as string;

      const result = await TrashService.restore(userId, type, id);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async permanentDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const type = req.params.type as 'property' | 'buyer' | 'deal';
      const id = req.params.id as string;

      const result = await TrashService.permanentDelete(userId, type, id);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

