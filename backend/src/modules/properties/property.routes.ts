import { Router } from 'express';
import { PropertyController } from './property.controller.js';
import { ShareController } from '../shares/share.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { planGuard } from '../../middleware/planGuard.js';
import { validate } from '../../middleware/validate.js';
import {
  createPropertySchema,
  updatePropertySchema,
  updatePropertyStatusSchema,
  listPropertiesQuerySchema,
} from './property.schema.js';
import { createShareSchema } from '../shares/share.schema.js';

export const propertyRouter = Router();

propertyRouter.use(requireAuth);

propertyRouter.post('/', planGuard('listing'), validate(createPropertySchema), PropertyController.create);
propertyRouter.get('/', validate(listPropertiesQuerySchema), PropertyController.list);
propertyRouter.post('/photos/sign', PropertyController.signPhotoUpload);
propertyRouter.get('/:id', PropertyController.getById);
propertyRouter.patch('/:id', validate(updatePropertySchema), PropertyController.update);
propertyRouter.patch('/:id/status', validate(updatePropertyStatusSchema), PropertyController.updateStatus);
propertyRouter.post('/:id/share', validate(createShareSchema), ShareController.create);
propertyRouter.delete('/:id/photos/{*publicId}', PropertyController.deletePhoto);
propertyRouter.delete('/:id', PropertyController.delete);
propertyRouter.get('/:id/matches', PropertyController.getMatches);

