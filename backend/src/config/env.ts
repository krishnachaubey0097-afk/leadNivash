import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from backend root if not already set
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000').transform(Number),
  TRUST_PROXY: z.string().default('1'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:5000'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  ENCRYPTION_KEY: z.string().transform(s => s.trim().replace(/^["']|["']$/g, '')).pipe(z.string().length(64, 'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)')),

  // Optional OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),

  // Optional LLM
  LLM_PROVIDER: z.string().default('gemini'),
  LLM_MODEL: z.string().default('gemini-2.5-flash'),
  LLM_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  LLM_TIMEOUT_MS: z.string().default('10000').transform(Number),
  LLM_DAILY_BUDGET_INR: z.string().default('200').transform(Number),
  PARSE_MAX_CHARS: z.string().default('4000').transform(Number),

  // Optional Media
  MEDIA_PROVIDER: z.string().default('cloudinary'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  MEDIA_MAX_PHOTOS: z.string().default('4').transform(Number),
  MEDIA_MAX_BYTES: z.string().default('2000000').transform(Number),

  // Optional Email & Alerts
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional().transform((val) => (val ? Number(val) : undefined)),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('LeadNivash <leadnivash@gmail.com>'),
  EMAIL_FROM: z.string().optional(),
  FOUNDER_ALERT_EMAIL: z.string().optional(),

  // Optional Web Push
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_EMAIL: z.string().optional(),

  // Plan defaults
  TRIAL_DAYS: z.string().default('14').transform(Number),

  // Sentry
  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

export const env: Env = parsed.success
  ? parsed.data
  : (process.env as unknown as Env);

export function validateEnv(customEnv?: Record<string, unknown>): {
  success: boolean;
  data?: Env;
  error?: z.ZodError<any>;
} {
  const result = envSchema.safeParse(customEnv ?? process.env);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
