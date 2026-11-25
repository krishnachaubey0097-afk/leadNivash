import { Router } from 'express';
import { ContactController } from './contact.controller.js';
import { validate } from '../../middleware/validate.js';
import { publicLimiter } from '../../middleware/rateLimiter.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { createContactLeadSchema, listContactLeadsQuerySchema } from './contact.schema.js';

export const publicContactRouter = Router();

publicContactRouter.post(
  '/',
  publicLimiter,
  validate(createContactLeadSchema),
  ContactController.submit
);

// Admin-only endpoint: list contact leads submitted via landing page (brokers receive 403)
publicContactRouter.get(
  '/',
  requireAuth,
  roleGuard('admin'),
  validate(listContactLeadsQuerySchema),
  ContactController.list
);

