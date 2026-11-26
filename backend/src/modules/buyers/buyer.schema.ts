import { z } from 'zod';

const localityItemSchema = z.union([
  z
    .object({
      display: z.string().min(1),
      key: z.string().min(1),
    })
    .strict(),
  z.string().min(1).transform((s) => ({
    display: s.trim(),
    key: s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general',
  })),
]);

export const createBuyerSchema = {
  body: z
    .object({
      name: z.string().min(2, 'Name is required').max(100),
      phone: z.string().min(10, 'Valid phone number is required'),
      email: z.string().email('Please enter a valid email address').max(150).optional().or(z.literal('')),
      localities: z.array(localityItemSchema).default([]),
      anyLocality: z.boolean().default(false),
      types: z.array(z.string()).default([]),
      purpose: z.enum(['Sale', 'Rent']).default('Sale'),
      budget: z
        .object({
          minPaise: z.number().int().min(0).optional(),
          maxPaise: z.number().int().min(10000, 'Max budget must be at least ₹100'),
          isApproximate: z.boolean().optional(),
        })
        .strict(),
      sizeGaj: z
        .object({
          min: z.number().min(0).optional(),
          max: z.number().optional(),
        })
        .strict()
        .optional(),
      urgency: z.enum(['hot', 'warm', 'cold']).default('warm'),
      status: z.enum(['active', 'paused', 'closed']).default('active'),
      notes: z.string().max(2000).optional(),
      rawText: z.string().max(4000).optional(),
      source: z.enum(['manual', 'paste', 'lead_form']).default('manual'),
    })
    .strict(),
};

export const updateBuyerSchema = {
  body: z
    .object({
      name: z.string().min(2).max(100).optional(),
      phone: z.string().min(10).optional(),
      email: z.string().email('Please enter a valid email address').max(150).optional().or(z.literal('')),
      localities: z.array(localityItemSchema).optional(),
      anyLocality: z.boolean().optional(),
      types: z.array(z.string()).optional(),
      purpose: z.enum(['Sale', 'Rent']).optional(),
      budget: z
        .object({
          minPaise: z.number().int().min(0).optional(),
          maxPaise: z.number().int().min(10000),
          isApproximate: z.boolean().optional(),
        })
        .strict()
        .optional(),
      sizeGaj: z
        .object({
          min: z.number().min(0).optional(),
          max: z.number().optional(),
        })
        .strict()
        .optional(),
      urgency: z.enum(['hot', 'warm', 'cold']).optional(),
      status: z.enum(['active', 'paused', 'closed']).optional(),
      notes: z.string().max(2000).optional(),
    })
    .strict(),
};

export const listBuyersQuerySchema = {
  query: z.object({
    page: z.string().default('1').transform((v) => Math.max(1, parseInt(v, 10) || 1)),
    limit: z.string().default('20').transform((v) => Math.min(50, Math.max(1, parseInt(v, 10) || 20))),
    status: z.enum(['active', 'paused', 'closed']).optional(),
    urgency: z.enum(['hot', 'warm', 'cold']).optional(),
    search: z.string().max(100).optional(),
  }),
};

