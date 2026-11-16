import { Router } from 'express';
import { TrashController } from './trash.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import { restoreTrashSchema, permanentDeleteTrashSchema } from './trash.schema.js';

export const trashRouter = Router();

trashRouter.use(requireAuth);

trashRouter.get('/', TrashController.listTrash);
trashRouter.post('/:type/:id/restore', validate(restoreTrashSchema), TrashController.restore);
trashRouter.delete('/:type/:id', validate(permanentDeleteTrashSchema), TrashController.permanentDelete);

