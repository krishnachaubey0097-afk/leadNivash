import type { Request, Response, NextFunction } from 'express';
import { PropertyService } from './property.service.js';
import { MediaService } from '../../services/media.service.js';
import { Matcher } from '../matches/matcher.js';
import { assertOwnership } from '../../utils/ownershipCheck.js';
import { Property } from './property.model.js';

export class PropertyController {
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const marlaToGaj = req.user?.plan ? 30.25 : 30.25;
      const { property, reverseMatchCount } = await PropertyService.create(userId, req.body, marlaToGaj);

      res.status(201).json({
        success: true,
        data: property,
        reverseMatches: {
          count: reverseMatchCount,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const result = await PropertyService.list(userId, req.query as any);

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
      const property = await PropertyService.getById(userId, req.params.id as string);

      res.status(200).json({
        success: true,
        data: property,
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const property = await PropertyService.update(userId, req.params.id as string, req.body);

      res.status(200).json({
        success: true,
        data: property,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const property = await PropertyService.updateStatus(userId, req.params.id as string, req.body.status);

      res.status(200).json({
        success: true,
        data: property,
      });
    } catch (err) {
      next(err);
    }
  }

  static async deletePhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const id = req.params.id as string;
      let raw: any = req.params.publicId || (req.params as any)[0];
      if (Array.isArray(raw)) {
        raw = raw.join('/');
      }
      const property = await PropertyService.deletePhoto(userId, id, raw);

      res.status(200).json({
        success: true,
        data: property,
      });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      await PropertyService.delete(userId, req.params.id as string);

      res.status(200).json({
        success: true,
        data: { message: 'Property deleted successfully' },
      });
    } catch (err) {
      next(err);
    }
  }

  static async getMatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const property = await assertOwnership(Property, req.params.id as string, userId);
      const matches = await Matcher.findBuyersForProperty(property, userId, 'all');

      res.status(200).json({
        success: true,
        data: matches,
      });
    } catch (err) {
      next(err);
    }
  }

  static async signPhotoUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id;
      const params = MediaService.getSignedUploadParams(userId);

      res.status(200).json({
        success: true,
        data: params,
      });
    } catch (err) {
      next(err);
    }
  }
}

