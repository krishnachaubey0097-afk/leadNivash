import { z } from 'zod';

export const createDealSchema = {
  body: z
    .object({
      buyerId: z.string().min(1, 'Buyer ID is required'),
      propertyId: z.string().optional(),
      propertyTitleSnapshot: z.string().min(1, 'Property title snapshot is required'),
      valuePaise: z.number().int().min(10000, 'Deal value must be at least ₹100'),
      commission: z
        .object({
          mode: z.enum(['percent', 'flat']),
          bps: z.number().int().min(1).max(10000).optional(),
          flatPaise: z.number().int().min(1).optional(),
        })
        .strict()
        .refine(
          (val) => (val.mode === 'percent' ? val.bps !== undefined : val.flatPaise !== undefined),
          { message: 'Commission requires bps for percent mode or flatPaise for flat mode' }
        ),
      stage: z.enum(['interested', 'shown', 'negotiating', 'finalized', 'paid', 'lost']).default('interested'),
      nextFollowUpAt: z.string().datetime().optional(),
      notes: z.string().max(2000).optional(),
    })
    .strict(),
};

export const updateDealStageSchema = {
  body: z
    .object({
      stage: z.enum(['interested', 'shown', 'negotiating', 'finalized', 'paid', 'lost']),
      lostReason: z.string().max(500).optional(),
    })
    .strict()
    .refine(
      (val) => (val.stage === 'lost' ? !!val.lostReason && val.lostReason.trim().length > 0 : true),
      { message: 'A reason is required when moving a deal to Lost' }
    ),
};

export const addDealPaymentSchema = {
  body: z
    .object({
      amountPaise: z.number().int().min(1, 'Payment amount must be greater than 0'),
      note: z.string().max(500).optional(),
      receivedAt: z.string().datetime().optional(),
    })
    .strict(),
};

