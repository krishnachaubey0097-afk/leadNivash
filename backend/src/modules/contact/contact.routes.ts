import { Router } from 'express';
import { ContactController } from './contact.controller.js';
import { validate } from '../../middleware/validate.js';
import { publicLimiter } from '../../middleware/rateLimiter.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { createContactLeadSchema, listContactLeadsQuerySchema } from './contact.schema.js';

export const publicContactRouter = Router();

publicContactRouter.post(
  '/',
  publicLimiter,
  validate(createContactLeadSchema),
  ContactController.submit
);

// Authenticated brokers/admins can list contact leads submitted via landing page
publicContactRouter.get(
  '/',
  requireAuth,
  validate(listContactLeadsQuerySchema),
  ContactController.list
);

