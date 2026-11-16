import { z } from 'zod';

export const createInquirySchema = {
  body: z
    .object({
      propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid property ID'),
      shareLinkId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid share link ID').optional(),
      name: z.string().min(2, 'Name must be at least 2 characters').max(80, 'Name too long'),
      phone: z.string().min(10, 'Valid mobile number required').max(20, 'Invalid phone number'),
      message: z.string().max(1000).optional(),
      website: z.string().optional(), // Honeypot field (must be empty)
    })
    .strict(),
};

export type CreateInquiryDto = z.infer<typeof createInquirySchema.body>;
