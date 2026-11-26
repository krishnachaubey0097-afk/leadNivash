import type { Request, Response, NextFunction } from 'express';
import { LeadFormService } from './leadForm.service.js';

export class LeadFormController {
  static async getPublicProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const brokerId = req.params.brokerId as string;
      const profile = await LeadFormService.getPublicProfile(brokerId);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (err) {
      next(err);
    }
  }

  static async submitLead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const brokerId = req.params.brokerId as string;
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const result = await LeadFormService.submitLead(brokerId, req.body, ip);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listBrokerSubmissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;

      const result = await LeadFormService.listBrokerSubmissions(userId, { page, limit });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
