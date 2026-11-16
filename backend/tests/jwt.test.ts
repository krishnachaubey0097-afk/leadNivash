import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../src/utils/jwt.js';

describe('JWT Utilities', () => {
  const user = {
    _id: '64a1b2c3d4e5f6a7b8c9d0e1',
    email: 'broker@leadnivesh.com',
    role: 'user' as const,
    sessionId: 'sess_123456',
  };

  it('signs and verifies access token with full payload', () => {
    const token = signAccessToken(user);
    expect(typeof token).toBe('string');

    const decoded = verifyAccessToken(token);
    expect(decoded._id).toBe(user._id);
    expect(decoded.email).toBe(user.email);
    expect(decoded.role).toBe('user');
    expect(decoded.sessionId).toBe(user.sessionId);
  });

  it('signs and verifies refresh token', () => {
    const token = signRefreshToken({ sessionId: user.sessionId, userId: user._id });
    expect(typeof token).toBe('string');

    const decoded = verifyRefreshToken(token);
    expect(decoded.sessionId).toBe(user.sessionId);
    expect(decoded.userId).toBe(user._id);
  });

  it('throws on tampered token', () => {
    const token = signAccessToken(user);
    const tampered = token.slice(0, -5) + 'xxxxx';
    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});

