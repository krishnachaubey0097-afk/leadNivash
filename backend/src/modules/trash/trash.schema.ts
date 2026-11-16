import { z } from 'zod';

export const trashParamsSchema = z.object({
  type: z.enum(['property', 'buyer', 'deal']),
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format'),
});

export const restoreTrashSchema = {
  params: trashParamsSchema,
};

export const permanentDeleteTrashSchema = {
  params: trashParamsSchema,
  body: z
    .object({
      confirmText: z.literal('PERMANENT DELETE', {
        message: 'confirmText must be exactly "PERMANENT DELETE"',
      }),
    })
    .strict(),
};

