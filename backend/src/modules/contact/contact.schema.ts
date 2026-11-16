import { z } from 'zod';

export const createContactLeadSchema = {
  body: z
    .object({
      name: z.string().min(2, 'Name must be at least 2 characters').max(100),
      email: z.string().email('Valid email is required').optional().or(z.literal('')),
      phone: z.string().min(10, 'Valid 10-digit mobile number required').max(20),
      message: z.string().min(5, 'Message must be at least 5 characters').max(2000),
      city: z.string().max(50).optional(),
      agencyName: z.string().max(100).optional(),
      website: z.string().optional(), // Honeypot field for bot detection
    })
    .strict(),
};

export const listContactLeadsQuerySchema = {
  query: z
    .object({
      page: z.string().regex(/^\d+$/).transform(Number).optional(),
      limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    })
    .strict()
    .optional(),
};

