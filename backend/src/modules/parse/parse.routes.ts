import { Router } from 'express';
import { ParseController } from './parse.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import { parseLimiter } from '../../middleware/rateLimiter.js';
import { parseInputSchema, parseCommitSchema } from './parse.schema.js';

export const parseRouter = Router();

parseRouter.use(requireAuth);

parseRouter.post('/', parseLimiter, validate(parseInputSchema), ParseController.parse);
parseRouter.post('/commit', validate(parseCommitSchema), ParseController.commit);

