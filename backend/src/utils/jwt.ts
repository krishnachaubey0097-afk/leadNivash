import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AuthenticatedUserPayload } from '../types/express.js';

export const JWT_ISSUER = 'leadnivesh-api';
export const JWT_AUDIENCE = 'leadnivesh-client';
export const JWT_ALGORITHM = 'HS256';

export interface TokenUserPayload {
  _id: string;
  email: string;
  role: 'user' | 'admin';
  sessionId: string;
}

export function signAccessToken(payload: TokenUserPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(payload: { sessionId: string; userId: string }): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AuthenticatedUserPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as AuthenticatedUserPayload;
}

export function verifyRefreshToken(token: string): { sessionId: string; userId: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as { sessionId: string; userId: string };
}
