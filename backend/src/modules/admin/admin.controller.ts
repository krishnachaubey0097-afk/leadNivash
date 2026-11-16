import type { Request, Response, NextFunction } from 'express';
import { AdminService } from './admin.service.js';

export class AdminController {
  static async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AdminService.listUsers(req.query as any);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateUserPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!._id;
      const targetUserId = req.params.id as string;
      const { tier, expiresAt } = req.body;

      const result = await AdminService.updateUserPlan(adminUserId, targetUserId, tier, expiresAt);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getUsage(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AdminService.getPlatformUsage();
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listInquiries(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AdminService.listInquiries(req.query as any);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ContactService } = await import('../contact/contact.service.js');
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const result = await ContactService.listContactLeads({ page, limit });
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
