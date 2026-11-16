import { describe, it, expect, vi } from 'vitest';
import { sanitizeObject, mongoSanitize } from '../src/middleware/mongoSanitize.js';

describe('NoSQL Injection Sanitizer', () => {
  it('strips keys starting with $ from nested objects', () => {
    const malicious = {
      username: 'rajesh',
      password: { $gt: '' },
      nested: {
        $where: 'sleep(1000)',
        validKey: 'safe',
      },
    };
    const sanitized: any = sanitizeObject(malicious);
    expect(sanitized.username).toBe('rajesh');
    expect(sanitized.password).toEqual({});
    expect(sanitized.nested.$where).toBeUndefined();
    expect(sanitized.nested.validKey).toBe('safe');
  });

  it('strips $ne, $gt, $regex, and $or operator injection vectors', () => {
    const payload = {
      email: { $ne: null },
      price: { $gt: 0 },
      search: { $regex: '.*' },
      $or: [{ admin: true }],
    };
    const sanitized: any = sanitizeObject(payload);
    expect(sanitized.email).toEqual({});
    expect(sanitized.price).toEqual({});
    expect(sanitized.search).toEqual({});
    expect(sanitized.$or).toBeUndefined();
  });

  it('strips keys containing dot notation from objects', () => {
    const malicious = {
      'user.role': 'admin',
      cleanKey: 'value',
    };
    const sanitized: any = sanitizeObject(malicious);
    expect(sanitized['user.role']).toBeUndefined();
    expect(sanitized.cleanKey).toBe('value');
  });

  it('handles arrays and deeply nested structures safely', () => {
    const input = [
      'normal',
      { $bad: 1, good: 2 },
      [{ nestedBad: { '$gt': 5 }, nestedGood: 'ok' }],
    ];
    const output: any = sanitizeObject(input);
    expect(output[0]).toBe('normal');
    expect(output[1].$bad).toBeUndefined();
    expect(output[1].good).toBe(2);
    expect(output[2][0].nestedBad).toEqual({});
    expect(output[2][0].nestedGood).toBe('ok');
  });

  it('middleware strips malicious keys from req.body, req.params, and req.query', () => {
    const req: any = {
      body: { username: 'test', password: { $ne: '' } },
      params: { id: '123', '$gt': 'malicious' },
      query: { filter: 'active', '$where': '1==1' },
    };
    const next = vi.fn();
    const middleware = mongoSanitize();
    middleware(req, {} as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.body.password).toEqual({});
    expect(req.params.$gt).toBeUndefined();
    expect(req.query.$where).toBeUndefined();
  });
});
