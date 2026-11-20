import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import morgan from 'morgan';
import { env } from './config/env.js';
import { logger } from './services/logger.service.js';
import { isDbConnected } from './config/db.js';
import { mongoSanitize } from './middleware/mongoSanitize.js';
import { globalLimiter, authLimiter, publicLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { userRouter } from './modules/users/user.routes.js';
import { propertyRouter } from './modules/properties/property.routes.js';
import { buyerRouter } from './modules/buyers/buyer.routes.js';
import { dealRouter } from './modules/deals/deal.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { matchRouter } from './modules/matches/match.routes.js';
import { aliasRouter } from './modules/aliases/alias.routes.js';
import { parseRouter } from './modules/parse/parse.routes.js';
import { shareRouter } from './modules/shares/share.routes.js';
import { inquiryRouter, brokerInquiryRouter } from './modules/inquiries/inquiry.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { trashRouter } from './modules/trash/trash.routes.js';
import { publicContactRouter } from './modules/contact/contact.routes.js';
import { handlePublicFlyer } from './modules/shares/publicFlyer.controller.js';

export const app = express();

// Trust proxy configuration for secure cookies & accurate rate limiting behind reverse proxies (Render, Railway, Nginx)
if (env.TRUST_PROXY === 'true') {
  app.set('trust proxy', true);
} else if (env.TRUST_PROXY === 'false') {
  app.set('trust proxy', false);
} else {
  const num = Number(env.TRUST_PROXY);
  app.set('trust proxy', isNaN(num) ? env.TRUST_PROXY : num);
}

// 1. Security Headers (Helmet)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https://*.cloudinary.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// 2. CORS (Explicit origin allowlist with credentials)
const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
const allowAll = allowedOrigins.includes('*');

const isAllowedOrigin = (origin: string): boolean => {
  if (allowAll) return true;
  if (allowedOrigins.includes(origin)) return true;
  // Automatically permit all Vercel preview and production deployments
  if (origin.endsWith('.vercel.app')) return true;
  // Automatically permit Render deployments
  if (origin.endsWith('.onrender.com')) return true;
  // Local development
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server) or in allowed list
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        logger.warn(`CORS blocked for unauthorized origin: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'x-test-suite'],
  })
);

// 3. Response Compression (Gzip / Deflate for fast mobile 2G/3G load speeds)
app.use(compression());

// 4. Body parsers
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(cookieParser());

// 5. NoSQL injection sanitizer
app.use(mongoSanitize());

// 5. Request logging in development
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// 6. Root & Platform Probes: / (welcome), /health (liveness), /ready (readiness)
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to LeadNivesh API - Modern Real Estate Broker Platform',
    version: '1.0.0',
    status: 'online',
    docs: '/api/v1',
    probes: {
      health: '/health',
      ready: '/ready',
    },
    endpoints: {
      auth: '/api/v1/auth/login',
      properties: '/api/v1/properties',
      buyers: '/api/v1/buyers',
      deals: '/api/v1/deals',
      matches: '/api/v1/matches',
      parse: '/api/v1/parse',
    },
  });
});

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', (_req: Request, res: Response) => {
  const ready = isDbConnected();
  if (ready) {
    res.status(200).json({
      success: true,
      status: 'ready',
      database: 'connected',
    });
  } else {
    res.status(503).json({
      success: false,
      status: 'not_ready',
      database: 'disconnected',
    });
  }
});

// 7. Rate Limiting & Public Share Pages
app.get('/p/:token', publicLimiter, handlePublicFlyer);

app.use('/api', globalLimiter);
app.use('/api/v1/auth', authLimiter);

// 8. API v1 Base Router
const apiV1 = express.Router();

apiV1.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      name: 'LeadNivesh API',
      version: '1.0.0',
      description: 'API for LeadNivesh Broker Platform',
    },
  });
});

// Mount modules
apiV1.use('/auth', authRouter);
apiV1.use('/users', userRouter);
apiV1.use('/properties', propertyRouter);
apiV1.use('/buyers', buyerRouter);
apiV1.use('/matches', matchRouter);
apiV1.use('/deals', dealRouter);
apiV1.use('/aliases', aliasRouter);
apiV1.use('/dashboard', dashboardRouter);
apiV1.use('/parse', parseRouter);
apiV1.use('/shares', shareRouter);
apiV1.use('/inquiries', brokerInquiryRouter);
apiV1.use('/trash', trashRouter);
apiV1.use('/public/inquiries', inquiryRouter);
apiV1.use('/public/contact', publicContactRouter);
apiV1.use('/admin', adminRouter);

app.use('/api/v1', apiV1);

// 9. 404 Fallback for unknown routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist',
    },
  });
});

// 10. Central Error Handler (always last)
app.use(errorHandler);
