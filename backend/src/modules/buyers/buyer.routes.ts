import { Router } from 'express';
import { BuyerController } from './buyer.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { planGuard } from '../../middleware/planGuard.js';
import { validate } from '../../middleware/validate.js';
import { createBuyerSchema, updateBuyerSchema, listBuyersQuerySchema } from './buyer.schema.js';

export const buyerRouter = Router();

buyerRouter.use(requireAuth);

buyerRouter.post('/', planGuard('buyer'), validate(createBuyerSchema), BuyerController.create);
buyerRouter.get('/', validate(listBuyersQuerySchema), BuyerController.list);
buyerRouter.get('/:id', BuyerController.getById);
buyerRouter.patch('/:id', validate(updateBuyerSchema), BuyerController.update);
buyerRouter.delete('/:id', BuyerController.delete);
buyerRouter.get('/:id/matches', BuyerController.getMatches);

