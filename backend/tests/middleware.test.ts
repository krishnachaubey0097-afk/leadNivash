import { describe, it, expect, vi } from 'vitest';
import { z, ZodError } from 'zod';
import { validate } from '../src/middleware/validate.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { requireAuth } from '../src/middleware/requireAuth.js';
import { roleGuard } from '../src/middleware/roleGuard.js';
import { assertOwnership } from '../src/utils/ownershipCheck.js';
import { signAccessToken } from '../src/utils/jwt.js';

describe('Validation Middleware (.strict() Enforcement)', () => {
  const schema = {
    body: z.object({
      email: z.string().email(),
      name: z.string(),
    }).strict(), // Reject unknown keys
  };

  it('passes valid request body matching schema', async () => {
    const req: any = { body: { email: 'test@example.com', name: 'Rajesh' } };
    const next = vi.fn();
    await validate(schema)(req, {} as any, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects unknown fields with validation error due to .strict()', async () => {
    const req: any = { body: { email: 'test@example.com', name: 'Rajesh', unknownField: 'danger' } };
    const next = vi.fn();
    await validate(schema)(req, {} as any, next);
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0]![0];
    expect(err).toBeInstanceOf(ZodError);
  });
});

describe('Central Error Handler', () => {
  it('formats ZodError into standard 400 VALIDATION_ERROR shape', () => {
    const testSchema = z.object({ email: z.string() });
    const parseResult = testSchema.safeParse({ email: 12345 });
    expect(parseResult.success).toBe(false);
    const zodError = (parseResult as any).error;

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    errorHandler(zodError, {} as any, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          fields: expect.objectContaining({
            email: expect.any(Array),
          }),
        }),
      })
    );
  });

  it('formats TokenExpiredError into 401 TOKEN_EXPIRED', () => {
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    errorHandler(err, {} as any, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' },
    });
  });

  it('formats duplicate key 11000 into 409 CONFLICT', () => {
    const err: any = new Error('E11000 duplicate key');
    err.code = 11000;
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    errorHandler(err, {} as any, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'CONFLICT', message: 'A resource with this identifier already exists' },
    });
  });
});

describe('Auth & Role Guards', () => {
  it('requireAuth rejects requests without Bearer header', () => {
    const req: any = { headers: {} };
    const next = vi.fn();
    requireAuth(req, {} as any, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0]![0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('requireAuth accepts valid access token and attaches req.user', () => {
    const token = signAccessToken({
      _id: '64a1b2c3d4e5f6a7b8c9d0e1',
      email: 'user@test.com',
      role: 'user',
      sessionId: 'sess_1',
    });
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const next = vi.fn();
    requireAuth(req, {} as any, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeDefined();
    expect(req.user.email).toBe('user@test.com');
  });

  it('roleGuard enforces role and returns 403 FORBIDDEN on mismatch', () => {
    const req: any = { user: { role: 'user' } };
    const next = vi.fn();
    roleGuard('admin')(req, {} as any, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0]![0];
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('roleGuard allows matching role', () => {
    const req: any = { user: { role: 'admin' } };
    const next = vi.fn();
    roleGuard('admin')(req, {} as any, next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe('assertOwnership Utility', () => {
  it('throws 404 NOT_FOUND on invalid ObjectId string (never 500)', async () => {
    const MockModel: any = { findOne: vi.fn() };
    await expect(assertOwnership(MockModel, 'invalid-id-not-hex', '64a1b2c3d4e5f6a7b8c9d0e1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    await expect(assertOwnership(MockModel, '64a1b2c3d4e5f6a7b8c9d0e1', 'invalid-user-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});
