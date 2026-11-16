import rateLimit from 'express-rate-limit';

const isTestRequest = (req: any) =>
  req.headers['x-test-suite'] === 'leadnivesh-internal-test' || process.env.NODE_ENV === 'test';

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  skip: isTestRequest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please wait a minute and try again.',
    },
  },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  skip: isTestRequest,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again after a minute.',
    },
  },
});

export const parseLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  skip: isTestRequest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'AI parse rate limit reached. Please wait a minute before analyzing more messages.',
    },
  },
});

export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  skip: isTestRequest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests to public page. Please wait a minute.',
    },
  },
});

export const matchQuickLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  skip: isTestRequest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many match evaluation requests. Please slow down.',
    },
  },
});

export const inquiryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  skip: isTestRequest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many inquiries submitted. Please wait a minute before submitting again.',
    },
  },
});


