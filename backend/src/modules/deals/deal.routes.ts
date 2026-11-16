import { Router } from 'express';
import { DealController } from './deal.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import { createDealSchema, updateDealStageSchema, addDealPaymentSchema } from './deal.schema.js';

export const dealRouter = Router();

dealRouter.use(requireAuth);

dealRouter.post('/', validate(createDealSchema), DealController.create);
dealRouter.get('/', DealController.list);
dealRouter.get('/summary', DealController.getSummary);
dealRouter.get('/:id', DealController.getById);
dealRouter.patch('/:id/stage', validate(updateDealStageSchema), DealController.updateStage);
dealRouter.post('/:id/payments', validate(addDealPaymentSchema), DealController.recordPayment);
dealRouter.delete('/:id', DealController.delete);

