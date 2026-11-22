import type { Request, Response, NextFunction } from 'express';
import { NotificationService } from './notification.service.js';

export class NotificationController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await NotificationService.listUserNotifications(req.user!._id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const data = await NotificationService.markAsRead(req.user!._id, id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await NotificationService.markAllAsRead(req.user!._id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      await NotificationService.deleteNotification(req.user!._id, id);
      res.status(200).json({
        success: true,
        message: 'Notification deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  static async clearAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await NotificationService.clearAllNotifications(req.user!._id);
      res.status(200).json({
        success: true,
        message: 'All notifications cleared successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}
