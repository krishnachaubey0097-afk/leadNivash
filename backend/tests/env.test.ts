import { describe, it, expect } from 'vitest';
import { validateEnv } from '../src/config/env.js';

describe('Environment Variable Validation', () => {
  const validMock = {
    NODE_ENV: 'test',
    PORT: '5000',
    MONGODB_URI: 'mongodb://localhost:27017/testdb',
    JWT_ACCESS_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    JWT_REFRESH_SECRET: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    CLIENT_URL: 'http://localhost:5173',
    PUBLIC_BASE_URL: 'http://localhost:5000',
    CORS_ORIGINS: 'http://localhost:5173',
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  };

  it('validates a complete valid environment configuration', () => {
    const res = validateEnv(validMock);
    expect(res.success).toBe(true);
    expect(res.data?.PORT).toBe(5000);
  });

  it('fails when MONGODB_URI is missing', () => {
    const invalid = { ...validMock, MONGODB_URI: '' };
    const res = validateEnv(invalid);
    expect(res.success).toBe(false);
  });

  it('fails when JWT_ACCESS_SECRET is too short (< 32 chars)', () => {
    const invalid = { ...validMock, JWT_ACCESS_SECRET: 'too-short' };
    const res = validateEnv(invalid);
    expect(res.success).toBe(false);
  });

  it('fails when ENCRYPTION_KEY is not exactly 64 hex chars', () => {
    const invalid = { ...validMock, ENCRYPTION_KEY: 'not-64-characters' };
    const res = validateEnv(invalid);
    expect(res.success).toBe(false);
  });
});

