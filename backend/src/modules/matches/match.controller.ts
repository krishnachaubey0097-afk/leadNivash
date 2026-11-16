import type { Request, Response, NextFunction } from 'express';
import { Property } from '../properties/property.model.js';
import { Buyer } from '../buyers/buyer.model.js';
import { Matcher } from './matcher.js';
import { scoreMatch } from './scoring.js';
import { assertOwnership } from '../../utils/ownershipCheck.js';

export class MatchController {
  static async getMatchesForProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const property = await assertOwnership(Property, req.params.id as string, req.user!._id);
      const matches = await Matcher.findBuyersForProperty(property, req.user!._id);
      res.status(200).json({
        success: true,
        data: matches,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getMatchesForBuyer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const buyer = await assertOwnership(Buyer, req.params.id as string, req.user!._id);
      const minGrade = (req.query.minGrade as any) || 'all';
      const matches = await Matcher.findPropertiesForBuyer(buyer, req.user!._id, minGrade);
      res.status(200).json({
        success: true,
        data: matches,
      });
    } catch (err) {
      next(err);
    }
  }

  static async quickMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { property, buyer, tolerancePct } = req.body;
      const result = scoreMatch(property, buyer, tolerancePct || 10);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

