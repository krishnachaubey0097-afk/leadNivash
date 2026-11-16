import { z } from 'zod';

export const createShareSchema = {
  body: z
    .object({
      template: z.enum(['flyer', 'simple', 'card']).default('flyer').optional(),
    })
    .strict(),
};

export type CreateShareDto = z.infer<typeof createShareSchema.body>;
