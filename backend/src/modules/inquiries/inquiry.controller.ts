import type { Request, Response, NextFunction } from 'express';
import { InquiryService } from './inquiry.service.js';

export class InquiryController {
  static async submit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const result = await InquiryService.submitInquiry(req.body, ip);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listBrokerInquiries(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;

      const result = await InquiryService.listBrokerInquiries(userId, { page, limit });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

