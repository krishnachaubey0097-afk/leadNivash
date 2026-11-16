import { Router } from 'express';
import { LocalityAliasController } from './alias.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import { createAliasSchema, updateAliasSchema, listAliasesQuerySchema } from './alias.schema.js';

export const aliasRouter = Router();

aliasRouter.use(requireAuth);

aliasRouter.get('/', validate(listAliasesQuerySchema), LocalityAliasController.list);
aliasRouter.post('/', validate(createAliasSchema), LocalityAliasController.create);
aliasRouter.patch('/:id', validate(updateAliasSchema), LocalityAliasController.update);
aliasRouter.delete('/:id', LocalityAliasController.delete);

