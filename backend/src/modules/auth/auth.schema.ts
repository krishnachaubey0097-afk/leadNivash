import { z } from 'zod';

export const registerSchema = {
  body: z
    .object({
      name: z.string().min(2, 'Name must be at least 2 characters').max(100),
      email: z.string().email('Valid email address is required').toLowerCase(),
      password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(72, 'Password cannot exceed 72 bytes (bcrypt limit)'),
      phone: z.string().min(10, 'Valid phone number is required'),
      agencyName: z.string().max(100).optional(),
      city: z.string().max(50).optional(),
      agency: z
        .object({
          name: z.string().max(100).optional(),
          city: z.string().max(50).optional(),
          reraNo: z.string().max(50).optional(),
        })
        .strict()
        .optional(),
      consent: z
        .object({
          termsAccepted: z.literal(true, {
            message: 'You must accept the Terms and Privacy Policy to register',
          }),
          privacyVersion: z.string().default('1.0'),
        })
        .strict(),
    })
    .strict(),
};

export const loginSchema = {
  body: z
    .object({
      email: z
        .string()
        .min(3, 'Valid email or mobile number is required')
        .max(100, 'Login identifier cannot exceed 100 characters'),
      password: z
        .string()
        .min(1, 'Password is required')
        .max(72, 'Password cannot exceed 72 bytes'),
    })
    .strict(),
};

export const sendOtpSchema = {
  body: z
    .object({
      email: z.string().email('Valid email address is required').toLowerCase().trim(),
      purpose: z.enum(['login', 'register', 'verify_email']).default('login'),
    })
    .strict(),
};

export const verifyOtpSchema = {
  body: z
    .object({
      email: z.string().email('Valid email address is required').toLowerCase().trim(),
      otp: z
        .string()
        .trim()
        .regex(/^\d{6}$/, 'Verification code must be 6 digits')
        .optional(),
      verificationToken: z.string().min(16).optional(),
      purpose: z.enum(['login', 'register', 'verify_email']).default('login'),
      name: z.string().min(2, 'Full name is required').max(100).optional(),
      phone: z.string().min(10, 'Valid mobile number is required').max(20).optional(),
      password: z.string().min(8, 'Password must be at least 8 characters').max(72).optional(),
      agencyName: z.string().max(100).optional(),
      city: z.string().max(50).optional(),
      agency: z
        .object({
          name: z.string().max(100).optional(),
          city: z.string().max(50).optional(),
          reraNo: z.string().max(50).optional(),
        })
        .strict()
        .optional(),
      consent: z
        .object({
          termsAccepted: z.boolean(),
          privacyVersion: z.string().default('1.0'),
        })
        .strict()
        .optional(),
    })
    .strict()
    .refine((data) => Boolean(data.otp || data.verificationToken), {
      message: 'Verification code or token is required',
      path: ['otp'],
    }),
};

export const revokeSessionSchema = {
  params: z
    .object({
      id: z.string().min(1, 'Session ID is required'),
    }),
};

export const forgotPasswordSchema = {
  body: z
    .object({
      email: z.string().email('Valid email address is required').toLowerCase(),
    })
    .strict(),
};

export const resetPasswordSchema = {
  body: z
    .object({
      token: z.string().min(1, 'Reset token is required'),
      newPassword: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(72, 'Password cannot exceed 72 bytes (bcrypt limit)'),
    })
    .strict(),
};

export const googleAuthSchema = {
  body: z
    .object({
      credential: z.string().min(10).optional(),
      accessToken: z.string().min(10).optional(),
      email: z.string().email('Valid email address is required').toLowerCase().optional(),
      name: z.string().min(1, 'Name is required').max(100).optional(),
      googleId: z.string().optional(),
      phone: z.string().optional(),
      agencyName: z.string().max(100).optional(),
      city: z.string().max(50).optional(),
      agency: z
        .object({
          name: z.string().max(100).optional(),
          city: z.string().max(50).optional(),
          reraNo: z.string().max(50).optional(),
        })
        .strict()
        .optional(),
      consent: z
        .object({
          termsAccepted: z.boolean(),
          privacyVersion: z.string().default('1.0'),
        })
        .strict()
        .optional(),
    })
    .strict(),
};
