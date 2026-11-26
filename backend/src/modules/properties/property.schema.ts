import { z } from 'zod';

export const createPropertySchema = {
  body: z
    .object({
      title: z.string().max(150).optional(),
      type: z.enum(['Plot', 'Kothi', 'Floor', 'Flat', 'Shop', 'Other']),
      category: z.enum(['Residential', 'Commercial']).default('Residential'),
      purpose: z.enum(['Sale', 'Rent']).default('Sale'),
      locality: z.string().min(2, 'Locality is required').max(100),
      city: z.string().max(50).default('Panipat'),
      landmark: z.string().max(150).optional(),
      size: z
        .object({
          value: z.number().positive('Size must be greater than 0'),
          unit: z.enum(['gaj', 'sqft', 'marla', 'kanal', 'acre', 'bigha']),
        })
        .strict(),
      priceDemandPaise: z
        .number()
        .int('Price must be an integer in paise')
        .min(10000, 'Price must be at least ₹100')
        .max(1000000000000, 'Price exceeds maximum allowable bound'),
      isApproxPrice: z.boolean().optional(),
      facing: z.string().max(50).optional(),
      tags: z.array(z.string().max(50)).max(10).optional(),
      description: z.string().max(2000).optional(),
      status: z.enum(['available', 'hold', 'sold', 'rented']).default('available'),
      photos: z
        .array(
          z
            .object({
              url: z.string().url(),
              publicId: z.string().min(1),
              width: z.number().optional(),
              height: z.number().optional(),
            })
            .strict()
        )
        .max(4, 'Maximum of 4 photos allowed per property')
        .optional(),
      video: z
        .object({
          url: z.string().url(),
          publicId: z.string().optional(),
          duration: z.number().optional(),
          thumbnailUrl: z.string().url().optional(),
        })
        .strict()
        .optional(),
      videoUrl: z.string().url().optional(),
      owner: z
        .object({
          name: z.string().max(100).optional(),
          phone: z.string().max(30).optional(),
          email: z.string().email().max(150).optional().or(z.literal('')),
          notes: z.string().max(1000).optional(),
        })
        .strict()
        .optional(),
      source: z.enum(['manual', 'paste', 'lead_form']).default('manual'),
    })
    .strict(),
};

export const updatePropertySchema = {
  body: z
    .object({
      title: z.string().max(150).optional(),
      type: z.enum(['Plot', 'Kothi', 'Floor', 'Flat', 'Shop', 'Other']).optional(),
      category: z.enum(['Residential', 'Commercial']).optional(),
      purpose: z.enum(['Sale', 'Rent']).optional(),
      locality: z.string().min(2).max(100).optional(),
      city: z.string().max(50).optional(),
      landmark: z.string().max(150).optional(),
      size: z
        .object({
          value: z.number().positive(),
          unit: z.enum(['gaj', 'sqft', 'marla', 'kanal', 'acre', 'bigha']),
        })
        .strict()
        .optional(),
      priceDemandPaise: z
        .number()
        .int()
        .min(10000)
        .max(1000000000000)
        .optional(),
      isApproxPrice: z.boolean().optional(),
      facing: z.string().max(50).optional(),
      tags: z.array(z.string().max(50)).max(10).optional(),
      description: z.string().max(2000).optional(),
      photos: z
        .array(
          z
            .object({
              url: z.string().url(),
              publicId: z.string().min(1),
              width: z.number().optional(),
              height: z.number().optional(),
            })
            .strict()
        )
        .max(4)
        .optional(),
      video: z
        .object({
          url: z.string().url(),
          publicId: z.string().optional(),
          duration: z.number().optional(),
          thumbnailUrl: z.string().url().optional(),
        })
        .strict()
        .optional(),
      videoUrl: z.string().url().optional(),
      owner: z
        .object({
          name: z.string().max(100).optional(),
          phone: z.string().max(30).optional(),
          email: z.string().email().max(150).optional().or(z.literal('')),
          notes: z.string().max(1000).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
};

export const updatePropertyStatusSchema = {
  body: z
    .object({
      status: z.enum(['available', 'hold', 'sold', 'rented']),
    })
    .strict(),
};

export const listPropertiesQuerySchema = {
  query: z.object({
    page: z.string().default('1').transform((v) => Math.max(1, parseInt(v, 10) || 1)),
    limit: z.string().default('20').transform((v) => Math.min(50, Math.max(1, parseInt(v, 10) || 20))),
    type: z.enum(['Plot', 'Kothi', 'Floor', 'Flat', 'Shop', 'Other']).optional(),
    status: z.enum(['available', 'hold', 'sold', 'rented']).optional(),
    localityKey: z.string().optional(),
    search: z.string().max(100).optional(),
  }),
};

