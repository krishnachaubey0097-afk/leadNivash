import { Router } from 'express';
import { ContactController } from './contact.controller.js';
import { validate } from '../../middleware/validate.js';
import { publicLimiter } from '../../middleware/rateLimiter.js';
import { createContactLeadSchema } from './contact.schema.js';

export const publicContactRouter = Router();

publicContactRouter.post(
  '/',
  publicLimiter,
  validate(createContactLeadSchema),
  ContactController.submit
);

