import { z } from 'zod';

export const createAliasSchema = {
  body: z
    .object({
      city: z.string().min(2).max(50).default('Panipat'),
      canonical: z.string().min(2, 'Canonical locality name is required').max(100),
      aliases: z.array(z.string().min(1).max(100)).min(1, 'At least one alias is required'),
    })
    .strict(),
};

export const updateAliasSchema = {
  body: z
    .object({
      canonical: z.string().min(2).max(100).optional(),
      aliases: z.array(z.string().min(1).max(100)).optional(),
    })
    .strict(),
};

export const listAliasesQuerySchema = {
  query: z.object({
    city: z.string().max(50).optional(),
    search: z.string().max(100).optional(),
  }),
};

