import { Router } from 'express';
import { NotificationController } from './notification.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

notificationRouter.get('/', NotificationController.list);
notificationRouter.patch('/read-all', NotificationController.markAllRead);
notificationRouter.patch('/:id/read', NotificationController.markRead);
notificationRouter.delete('/clear-all', NotificationController.clearAll);
notificationRouter.delete('/:id', NotificationController.delete);
notificationRouter.delete('/', NotificationController.clearAll);
