import { z } from 'zod';

const objectIdParam = z.object({
  brokerId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid broker lead form link'),
});

export const getLeadFormProfileSchema = {
  params: objectIdParam,
};

export const submitLeadFormSchema = {
  params: objectIdParam,
  body: z
    .object({
      category: z.enum(['buyer', 'seller']),
      name: z.string().trim().min(2, 'Full name is required (min 2 characters)').max(100),
      phone: z.string().trim().min(10, 'Valid 10-digit mobile number is required').max(20),
      email: z
        .string()
        .trim()
        .email('Please enter a valid email address')
        .max(150)
        .optional()
        .or(z.literal('')),
      purpose: z.enum(['Sale', 'Rent']).default('Sale'),
      budgetPaise: z
        .number()
        .int('Budget must be in integer paise')
        .min(10000, 'Budget / price must be at least ₹100')
        .max(1000000000000, 'Amount exceeds maximum bound'),
      isApproxBudget: z.boolean().default(true),

      // Buyer-specific fields
      types: z.array(z.string().trim().min(1).max(50)).max(8).optional(),
      localities: z.array(z.string().trim().min(1).max(100)).max(8).optional(),
      anyLocality: z.boolean().optional(),
      sizeMin: z.number().positive().optional(),
      sizeMax: z.number().positive().optional(),
      sizeUnit: z.enum(['gaj', 'sqft', 'marla', 'kanal', 'acre', 'bigha']).default('gaj'),
      urgency: z.enum(['hot', 'warm', 'cold']).default('warm'),
      notes: z.string().trim().max(2000).optional(),

      // Seller-specific fields
      propertyCategory: z.enum(['Residential', 'Commercial']).default('Residential'),
      propertyType: z.enum(['Plot', 'Kothi', 'Floor', 'Flat', 'Shop', 'Other']).optional(),
      locality: z.string().trim().max(100).optional(),
      city: z.string().trim().max(50).optional(),
      landmark: z.string().trim().max(150).optional(),
      sizeValue: z.number().positive().optional(),
      facing: z.string().trim().max(50).optional(),
      highlights: z.array(z.string().trim().min(1).max(50)).max(10).optional(),

      // Honeypot anti-bot trap
      website: z.string().max(200).optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      const digits = data.phone.replace(/\D/g, '');
      const tenDigits = digits.length >= 10 ? digits.slice(-10) : '';
      if (!/^[6-9]\d{9}$/.test(tenDigits)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['phone'],
          message: 'Please enter a valid 10-digit Indian mobile number starting with 6-9',
        });
      }

      if (data.category === 'seller') {
        if (!data.propertyType) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['propertyType'],
            message: 'Please select a property type',
          });
        }
        if (!data.locality || data.locality.trim().length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['locality'],
            message: 'Please enter the property locality or sector',
          });
        }
        if (!data.sizeValue || data.sizeValue <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['sizeValue'],
            message: 'Please enter the property area size',
          });
        }
      }
    }),
};

export type SubmitLeadFormDto = z.infer<typeof submitLeadFormSchema.body>;
