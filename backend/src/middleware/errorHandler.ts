import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../services/logger.service.js';
import { env } from '../config/env.js';

export interface StandardErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
}

export function errorHandler(
  err: any,
  _req: Request,
  res: Response<StandardErrorResponse>,
  _next: NextFunction
): void {
  // Log server errors
  const status = err.statusCode || (err.status ? Number(err.status) : 500);

  if (status >= 500) {
    logger.error('Unhandled server error:', { message: err.message, stack: err.stack });
  }

  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const fieldPath = issue.path.join('.');
      if (!fields[fieldPath]) {
        fields[fieldPath] = [];
      }
      fields[fieldPath]!.push(issue.message);
    }
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        fields,
      },
    });
    return;
  }

  // 2. JWT Errors
  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Access token expired',
      },
    });
    return;
  }

  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_INVALID',
        message: 'Invalid access token',
      },
    });
    return;
  }

  // 3. Mongoose Cast / Validation Errors
  if (err.name === 'CastError') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: `Invalid format for field: ${err.path}`,
      },
    });
    return;
  }

  if (err.name === 'ValidationError') {
    const fields: Record<string, string[]> = {};
    for (const [k, v] of Object.entries((err as any).errors || {})) {
      fields[k] = [(v as any).message];
    }
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Data validation failed',
        fields,
      },
    });
    return;
  }

  // 4. Duplicate Key / Conflict
  if (err.code === 11000) {
    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'A resource with this identifier already exists',
      },
    });
    return;
  }

  // 5. Default custom error code and status
  const code = err.code && typeof err.code === 'string' ? err.code : 'INTERNAL_ERROR';
  const message =
    status >= 500 && env.NODE_ENV === 'production'
      ? 'An unexpected error occurred. Please try again later.'
      : err.message || 'An error occurred';

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(err.fields ? { fields: err.fields } : {}),
    },
  });
}

