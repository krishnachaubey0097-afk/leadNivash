import type { Request, Response, NextFunction } from 'express';
import { BuyerService } from './buyer.service.js';
import { Matcher } from '../matches/matcher.js';
import { assertOwnership } from '../../utils/ownershipCheck.js';
import { Buyer } from './buyer.model.js';

export class BuyerController {
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const { buyer, duplicateWarning } = await BuyerService.create(userId, req.body);

      res.status(201).json({
        success: true,
        data: buyer,
        ...(duplicateWarning ? { warning: duplicateWarning } : {}),
      });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const result = await BuyerService.list(userId, req.query as any);

      res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const buyer = await BuyerService.getById(userId, req.params.id as string);

      res.status(200).json({
        success: true,
        data: buyer,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const buyer = await BuyerService.update(userId, req.params.id as string, req.body);

      res.status(200).json({
        success: true,
        data: buyer,
      });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      await BuyerService.delete(userId, req.params.id as string);

      res.status(200).json({
        success: true,
        data: { message: 'Buyer deleted successfully' },
      });
    } catch (err) {
      next(err);
    }
  }

  static async getMatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const buyer = await assertOwnership(Buyer, req.params.id as string, userId);
      const matches = await Matcher.findPropertiesForBuyer(buyer, userId, 'all');

      res.status(200).json({
        success: true,
        data: matches,
      });
    } catch (err) {
      next(err);
    }
  }
}

