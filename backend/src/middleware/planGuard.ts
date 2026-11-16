import type { Request, Response, NextFunction } from 'express';
import { isPlanExpired, getPlanLimits } from '../config/plans.js';
import { User } from '../modules/users/user.model.js';
import { Property } from '../modules/properties/property.model.js';
import { Buyer } from '../modules/buyers/buyer.model.js';

export type ProtectedFeature = 'listing' | 'buyer' | 'parse' | 'flyerBranding';

export function planGuard(feature?: ProtectedFeature) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        const err = new Error('Authentication required') as any;
        err.statusCode = 401;
        err.code = 'UNAUTHORIZED';
        return next(err);
      }

      // Admins bypass all plan guards
      if (user.role === 'admin') {
        return next();
      }

      let plan = (user as any).plan;
      if (!plan && user._id) {
        const userDoc = await User.findById(user._id).select('plan role isDeleted isDisabled');
        if (!userDoc || userDoc.isDeleted) {
          const err = new Error('User not found') as any;
          err.statusCode = 404;
          err.code = 'NOT_FOUND';
          return next(err);
        }

        if (userDoc.isDisabled) {
          const err = new Error('Account disabled') as any;
          err.statusCode = 403;
          err.code = 'FORBIDDEN';
          return next(err);
        }

        plan = userDoc.plan;
      }

      // Check plan expiration
      if (isPlanExpired(plan)) {
        const err = new Error('Your plan or trial has expired. Please upgrade to continue.') as any;
        err.statusCode = 402;
        err.code = 'PLAN_LIMIT_REACHED';
        return next(err);
      }

      const limits = getPlanLimits(plan?.tier);

      // Feature & counter enforcement
      if (feature === 'listing' && user._id) {
        const currentCount = await Property.countDocuments({
          userId: user._id,
          isDeleted: false,
        });

        if (currentCount >= limits.maxListings) {
          const err = new Error(
            `You have reached the maximum listing limit (${limits.maxListings}) for your plan. Please upgrade to add more properties.`
          ) as any;
          err.statusCode = 402;
          err.code = 'PLAN_LIMIT_REACHED';
          return next(err);
        }
      } else if (feature === 'buyer' && user._id) {
        const currentCount = await Buyer.countDocuments({
          userId: user._id,
          isDeleted: false,
        });

        if (currentCount >= limits.maxBuyers) {
          const err = new Error(
            `You have reached the maximum buyer limit (${limits.maxBuyers}) for your plan. Please upgrade to add more buyers.`
          ) as any;
          err.statusCode = 402;
          err.code = 'PLAN_LIMIT_REACHED';
          return next(err);
        }
      } else if (feature === 'flyerBranding') {
        if (!limits.flyerBranding) {
          const err = new Error('Custom branding is available on Pro plan only.') as any;
          err.statusCode = 402;
          err.code = 'PLAN_LIMIT_REACHED';
          return next(err);
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
