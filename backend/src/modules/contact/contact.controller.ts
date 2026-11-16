import type { Request, Response, NextFunction } from 'express';
import { ContactService } from './contact.service.js';

export class ContactController {
  static async submit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const result = await ContactService.submitContactLead(req.body, ip);

      res.status(201).json({
        success: true,
        data: {
          message: 'Thank you for reaching out to LeadNivesh. We will get back to you shortly.',
          id: result.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
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

