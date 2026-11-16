import type { Request, Response, NextFunction } from 'express';

/**
 * Recursively sanitize an object by stripping keys that start with '$' or contain '.'
 * (NoSQL operator injection vectors).
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item)) as unknown as T;
  }

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Drop keys starting with $ or containing dots
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }
    clean[key] = sanitizeObject(value);
  }
  return clean as T;
}

/**
 * Express middleware for NoSQL injection prevention that is 100% compatible with Express 5.
 * Safely sanitizes req.body and req.params, and sanitizes mutable properties of req.query.
 */
export function mongoSanitize() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }
    if (req.query && typeof req.query === 'object') {
      try {
        const sanitizedQuery = sanitizeObject({ ...req.query });
        // In Express 5 req.query cannot be reassigned, but properties can be reassigned or deleted
        for (const key of Object.keys(req.query)) {
          if (key.startsWith('$') || key.includes('.')) {
            delete (req.query as any)[key];
          }
        }
        Object.assign(req.query, sanitizedQuery);
      } catch {
        // Fallback: continue safely
      }
    }
    next();
  };
}

