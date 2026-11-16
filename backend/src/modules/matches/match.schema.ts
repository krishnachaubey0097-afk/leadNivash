import { z } from 'zod';

export const quickMatchSchema = {
  body: z
    .object({
      property: z
        .object({
          type: z.string().min(1),
          category: z.string().optional(),
          purpose: z.enum(['Sale', 'Rent']),
          localityKey: z.string().min(1),
          priceDemandPaise: z.number().int().min(10000),
          sizeGaj: z.number().min(0.1),
          status: z.enum(['available', 'hold', 'sold', 'rented']).default('available'),
          tags: z.array(z.string()).optional(),
        })
        .strict(),
      buyer: z
        .object({
          purpose: z.enum(['Sale', 'Rent']),
          types: z.array(z.string()).default([]),
          localities: z
            .array(
              z
                .object({
                  key: z.string().min(1),
                  display: z.string().min(1),
                })
                .strict()
            )
            .default([]),
          anyLocality: z.boolean().default(false),
          budget: z
            .object({
              minPaise: z.number().int().min(0).optional(),
              maxPaise: z.number().int().min(10000),
            })
            .strict(),
          sizeGaj: z
            .object({
              min: z.number().min(0).optional(),
              max: z.number().optional(),
            })
            .strict()
            .optional(),
        })
        .strict(),
      tolerancePct: z.number().min(0).max(50).default(10),
    })
    .strict(),
};

