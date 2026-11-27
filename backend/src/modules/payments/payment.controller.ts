import type { Request, Response, NextFunction } from 'express';
import { CashfreeService } from './cashfree.service.js';

export class PaymentController {
  static getConfig(_req: Request, res: Response): void {
    res.status(200).json({
      success: true,
      data: CashfreeService.getPublicConfig(),
    });
  }

  static async createCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await CashfreeService.createCheckoutSession(req.user!._id, req.body);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async verifyCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await CashfreeService.verifyCheckoutReturn(req.user!._id, req.body);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async cancelSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await CashfreeService.cancelSubscription(
        req.user!._id,
        req.body.subscriptionId
      );
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const records = await CashfreeService.getHistory(req.user!._id);
      res.status(200).json({
        success: true,
        data: records,
      });
    } catch (err) {
      next(err);
    }
  }

  static async webhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawBody = (req as any).rawBody || JSON.stringify(req.body || {});
      const signature = req.headers['x-webhook-signature'] as string | undefined;
      const timestamp = req.headers['x-webhook-timestamp'] as string | undefined;

      const result = await CashfreeService.handleWebhook(rawBody, signature, timestamp);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
