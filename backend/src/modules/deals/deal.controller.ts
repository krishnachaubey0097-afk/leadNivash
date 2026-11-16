import type { Request, Response, NextFunction } from 'express';
import { DealService } from './deal.service.js';

export class DealController {
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const deal = await DealService.create(userId, req.body);

      res.status(201).json({
        success: true,
        data: deal,
      });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const stage = req.query.stage as string | undefined;
      const deals = await DealService.list(userId, stage);

      res.status(200).json({
        success: true,
        data: deals,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const deal = await DealService.getById(userId, req.params.id as string);

      res.status(200).json({
        success: true,
        data: deal,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateStage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const deal = await DealService.updateStage(
        userId,
        req.params.id as string,
        req.body.stage,
        req.body.lostReason
      );

      res.status(200).json({
        success: true,
        data: deal,
      });
    } catch (err) {
      next(err);
    }
  }

  static async recordPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const receivedAt = req.body.receivedAt ? new Date(req.body.receivedAt) : new Date();
      const deal = await DealService.recordPayment(
        userId,
        req.params.id as string,
        req.body.amountPaise,
        req.body.note,
        receivedAt
      );

      res.status(200).json({
        success: true,
        data: deal,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const summary = await DealService.getSummary(userId);

      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      await DealService.delete(userId, req.params.id as string);

      res.status(200).json({
        success: true,
        data: { message: 'Deal deleted successfully' },
      });
    } catch (err) {
      next(err);
    }
  }
}

