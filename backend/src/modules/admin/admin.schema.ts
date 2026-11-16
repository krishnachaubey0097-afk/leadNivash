import { z } from 'zod';

export const updateUserPlanSchema = {
  body: z
    .object({
      tier: z.enum(['trial', 'lite', 'pro']),
      expiresAt: z.string().datetime().optional().nullable(),
    })
    .strict(),
};

export const adminListUsersSchema = {
  query: z
    .object({
      page: z.coerce.number().int().positive().default(1).optional(),
      limit: z.coerce.number().int().positive().max(50).default(20).optional(),
      search: z.string().optional(),
      tier: z.enum(['trial', 'lite', 'pro']).optional(),
    })
    .strict(),
};
