import { Router } from 'express';
import { AdminController } from './admin.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { validate } from '../../middleware/validate.js';
import { adminListUsersSchema, updateUserPlanSchema } from './admin.schema.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, roleGuard('admin'));

adminRouter.get('/users', validate(adminListUsersSchema), AdminController.listUsers);
adminRouter.patch('/users/:id/plan', validate(updateUserPlanSchema), AdminController.updateUserPlan);
adminRouter.get('/usage', AdminController.getUsage);
adminRouter.get('/inquiries', AdminController.listInquiries);
adminRouter.get('/contacts', AdminController.listContacts);
