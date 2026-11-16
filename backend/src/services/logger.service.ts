import winston from 'winston';
import * as Sentry from '@sentry/node';
import { env } from '../config/env.js';

// Sensitive keys to redact from log objects
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'refreshtokenhash',
  'authorization',
  'cookie',
  'secret',
  'encryption_key',
  'owner',
  'phone',
  'phonee164',
]);

function redactInPlace(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactInPlace(item, depth + 1));
  }

  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      (obj as Record<string, unknown>)[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      (obj as Record<string, unknown>)[key] = redactInPlace(val, depth + 1);
    }
  }
  return obj;
}

const redactFormat = winston.format((info) => {
  redactInPlace(info);
  return info;
});

const devConsoleFormat = winston.format.printf((info) => {
  const { timestamp, level, message, stack, ...meta } = info;
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  if (stack) {
    return `${timestamp} [${level}]: ${message}\n${stack}${metaStr}`;
  }
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    redactFormat(),
    winston.format.errors({ stack: true }),
    env.NODE_ENV === 'production' ? winston.format.json() : devConsoleFormat
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Initialize Sentry if DSN is provided
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    beforeSend(event) {
      // Scrub sensitive headers & breadcrumbs before sending
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });
  logger.info('Initialized Sentry monitoring');
}

