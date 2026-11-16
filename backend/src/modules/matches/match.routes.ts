import { Router } from 'express';
import { MatchController } from './match.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import { matchQuickLimiter } from '../../middleware/rateLimiter.js';
import { quickMatchSchema } from './match.schema.js';

export const matchRouter = Router();

matchRouter.use(requireAuth);

// Ad-hoc quick match evaluation between property & buyer payloads
matchRouter.post('/quick', matchQuickLimiter, validate(quickMatchSchema), MatchController.quickMatch);
