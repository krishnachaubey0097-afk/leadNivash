import { z } from 'zod';

export const updateUserSchema = {
  body: z
    .object({
      name: z.string().min(2).max(100).optional(),
      phone: z.string().min(10).optional(),
      agency: z
        .object({
          name: z.string().max(100).optional(),
          city: z.string().max(50).optional(),
          logoUrl: z.string().url().optional(),
          reraNo: z.string().max(50).optional(),
        })
        .strict()
        .optional(),
      preferences: z
        .object({
          language: z.enum(['en', 'hi']).optional(),
          budgetTolerancePct: z.number().min(0).max(50).optional(),
          marlaToGaj: z.number().positive().optional(),
          defaultCity: z.string().max(50).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
};

export const deleteUserSchema = {
  body: z
    .object({
      confirmText: z.literal('DELETE MY ACCOUNT', {
        message: 'You must type "DELETE MY ACCOUNT" exactly to delete your account',
      }),
    })
    .strict(),
};
