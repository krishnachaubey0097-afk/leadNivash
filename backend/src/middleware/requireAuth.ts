import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';

export interface AuthError extends Error {
  statusCode: number;
  code: string;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Authentication required') as AuthError;
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    return next(err);
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    const err = new Error('Authentication required') as AuthError;
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    return next(err);
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      const error = new Error('Access token expired') as AuthError;
      error.statusCode = 401;
      error.code = 'TOKEN_EXPIRED';
      return next(error);
    }
    const error = new Error('Invalid or malformed access token') as AuthError;
    error.statusCode = 401;
    error.code = 'TOKEN_INVALID';
    return next(error);
  }
}

