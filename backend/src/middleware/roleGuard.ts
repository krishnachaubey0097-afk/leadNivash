import type { Request, Response, NextFunction } from 'express';

export function roleGuard(...allowedRoles: Array<'user' | 'admin'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      const err = new Error('Authentication required') as any;
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      return next(err);
    }

    if (!allowedRoles.includes(req.user.role)) {
      const err = new Error('Insufficient permissions') as any;
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      return next(err);
    }

    next();
  };
}

