import { z } from 'zod';

export const parseInputSchema = {
  body: z
    .object({
      rawText: z
        .string()
        .trim()
        .min(2, 'Text must be at least 2 characters')
        .max(5000, 'Text must not exceed 5000 characters'),
      marlaToGaj: z.number().positive().default(30.25).optional(),
    })
    .strict(),
};

export const parseCommitSchema = {
  body: z
    .object({
      itemType: z.enum(['listing', 'buyer']),
      data: z.record(z.string(), z.any()),
    })
    .strict(),
};

export type ParseInputDto = z.infer<typeof parseInputSchema.body>;
export type ParseCommitDto = z.infer<typeof parseCommitSchema.body>;
