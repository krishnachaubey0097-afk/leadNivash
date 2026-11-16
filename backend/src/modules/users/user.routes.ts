import { Router } from 'express';
import { UserController } from './user.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import { updateUserSchema, deleteUserSchema } from './user.schema.js';

export const userRouter = Router();

userRouter.use(requireAuth);

userRouter.get('/me', UserController.getMe);
userRouter.patch('/me', validate(updateUserSchema), UserController.updateMe);
userRouter.post('/me/logo/sign', UserController.signLogoUpload);
userRouter.get('/me/export', UserController.exportData);
userRouter.delete('/me', validate(deleteUserSchema), UserController.deleteAccount);

