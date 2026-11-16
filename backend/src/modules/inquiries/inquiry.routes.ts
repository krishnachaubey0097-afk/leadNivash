import { Router } from 'express';
import { InquiryController } from './inquiry.controller.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { inquiryLimiter } from '../../middleware/rateLimiter.js';
import { createInquirySchema } from './inquiry.schema.js';

export const publicInquiryRouter = Router();
// Public endpoint: submit buyer inquiry on a shared property flyer
publicInquiryRouter.post('/', inquiryLimiter, validate(createInquirySchema), InquiryController.submit);

export const brokerInquiryRouter = Router();
// Protected endpoint: broker lists inquiries received on their properties
brokerInquiryRouter.use(requireAuth);
brokerInquiryRouter.get('/', InquiryController.listBrokerInquiries);

// Alias for backwards compatibility if referenced
export const inquiryRouter = publicInquiryRouter;


