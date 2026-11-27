import { z } from 'zod';

export const checkoutSchema = {
  body: z
    .object({
      planCode: z.enum(['monthly_399', 'yearly_trial_3299', 'yearly_3999']),
      mode: z.enum(['autopay', 'one_time']).default('autopay'),
      returnOrigin: z.string().url().optional(),
    })
    .strict(),
};

export const verifyPaymentSchema = {
  body: z
    .object({
      subscriptionId: z.string().min(4).max(120).optional(),
      orderId: z.string().min(4).max(120).optional(),
    })
    .strict()
    .refine((d) => Boolean(d.subscriptionId || d.orderId), {
      message: 'Either subscriptionId or orderId is required',
      path: ['subscriptionId'],
    }),
};

export const cancelSubscriptionSchema = {
  body: z
    .object({
      subscriptionId: z.string().min(4).max(120),
    })
    .strict(),
};
