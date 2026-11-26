import { Router } from 'express';
import { LeadFormController } from './leadForm.controller.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { publicLimiter, inquiryLimiter } from '../../middleware/rateLimiter.js';
import { getLeadFormProfileSchema, submitLeadFormSchema } from './leadForm.schema.js';

export const publicLeadFormRouter = Router();

// Public routes opened by Buyer / Seller clients via a shared broker link
publicLeadFormRouter.get(
  '/:brokerId',
  publicLimiter,
  validate(getLeadFormProfileSchema),
  LeadFormController.getPublicProfile
);

publicLeadFormRouter.post(
  '/:brokerId',
  inquiryLimiter,
  validate(submitLeadFormSchema),
  LeadFormController.submitLead
);

export const brokerLeadFormRouter = Router();
brokerLeadFormRouter.use(requireAuth);
brokerLeadFormRouter.get('/submissions', LeadFormController.listBrokerSubmissions);
