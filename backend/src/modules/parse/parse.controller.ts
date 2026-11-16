import type { Request, Response, NextFunction } from 'express';
import { ParseService } from './parse.service.js';

export class ParseController {
  static async parse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const { rawText, marlaToGaj } = req.body;

      const result = await ParseService.parseText(userId, rawText, marlaToGaj);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async commit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const result = await ParseService.commit(userId, req.body);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

