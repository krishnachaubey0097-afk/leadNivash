import { Router } from 'express';
import { PaymentController } from './payment.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import { publicLimiter } from '../../middleware/rateLimiter.js';
import {
  checkoutSchema,
  verifyPaymentSchema,
  cancelSubscriptionSchema,
} from './payment.schema.js';

export const paymentRouter = Router();

// Public gateway config & Cashfree HMAC-verified webhook
paymentRouter.get('/config', publicLimiter, PaymentController.getConfig);
paymentRouter.post('/cashfree/webhook', PaymentController.webhook);

// Authenticated broker billing routes
paymentRouter.post(
  '/cashfree/checkout',
  requireAuth,
  validate(checkoutSchema),
  PaymentController.createCheckout
);
paymentRouter.post(
  '/cashfree/verify',
  requireAuth,
  validate(verifyPaymentSchema),
  PaymentController.verifyCheckout
);
paymentRouter.post(
  '/cashfree/cancel',
  requireAuth,
  validate(cancelSubscriptionSchema),
  PaymentController.cancelSubscription
);
paymentRouter.get('/history', requireAuth, PaymentController.getHistory);
