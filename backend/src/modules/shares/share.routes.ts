import { Router } from 'express';
import { ShareController } from './share.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';

export const shareRouter = Router();

shareRouter.use(requireAuth);

shareRouter.delete('/:id', ShareController.revoke);

