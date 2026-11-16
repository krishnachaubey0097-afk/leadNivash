import type { Request, Response, NextFunction } from 'express';
import { LocalityAliasService } from './alias.service.js';

export class LocalityAliasController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const city = (req.query.city as string) || 'Panipat';
      const aliases = await LocalityAliasService.list(req.user!._id, city);
      res.status(200).json({
        success: true,
        data: aliases,
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const alias = await LocalityAliasService.create(req.user!._id, req.body);
      res.status(201).json({
        success: true,
        data: alias,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const updated = await LocalityAliasService.update(req.user!._id, id, req.body);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      await LocalityAliasService.delete(req.user!._id, id);
      res.status(200).json({
        success: true,
        message: 'Locality alias deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}

