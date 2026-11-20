import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { authLimiter } from '../../middleware/rateLimiter.js';
import {
  registerSchema,
  loginSchema,
  revokeSessionSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  googleAuthSchema,
} from './auth.schema.js';

export const authRouter = Router();

authRouter.post('/google', authLimiter, validate(googleAuthSchema), AuthController.googleAuth);

authRouter.post('/register', authLimiter, validate(registerSchema), AuthController.register);
authRouter.get('/register', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Register endpoint requires an HTTP POST request with a JSON body.',
    method: 'POST',
    requiredFields: ['name', 'email', 'password', 'phone', 'consent']
  });
});

authRouter.post('/login', authLimiter, validate(loginSchema), AuthController.login);
authRouter.get('/login', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Login endpoint requires an HTTP POST request with a JSON body.',
    method: 'POST',
    endpoint: 'http://localhost:5000/api/v1/auth/login',
    testCredentials: {
      email: 'broker@leadnivesh.com',
      password: 'Broker@123456'
    },
    instructions: 'Send a POST request using Postman, curl, or your frontend application.'
  });
});
authRouter.post('/refresh', AuthController.refresh);
authRouter.post('/logout', AuthController.logout);

authRouter.post('/send-otp', authLimiter, AuthController.sendOtp);
authRouter.post('/verify-otp', authLimiter, AuthController.verifyOtp);

authRouter.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  AuthController.forgotPassword
);

authRouter.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  AuthController.resetPassword
);

// Protected session endpoints
authRouter.get('/sessions', requireAuth, AuthController.listSessions);
authRouter.delete('/sessions/:id', requireAuth, validate(revokeSessionSchema), AuthController.revokeSession);

