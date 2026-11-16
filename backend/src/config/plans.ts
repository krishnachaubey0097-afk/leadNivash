export interface PlanLimits {
  maxListings: number;
  maxBuyers: number;
  maxParsesMonthly: number;
  maxPhotosPerListing: number;
  flyerBranding: boolean; // true = custom branding without LeadNivesh watermark
  supportLevel: 'community' | 'standard' | 'priority';
}

export interface PlanConfig {
  name: string;
  priceINR: number;
  limits: PlanLimits;
}

export type PlanTier = 'trial' | 'lite' | 'pro';

export const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
  trial: {
    name: '14-Day Pilot Trial',
    priceINR: 0,
    limits: {
      maxListings: 15,
      maxBuyers: 10,
      maxParsesMonthly: 100,
      maxPhotosPerListing: 4,
      flyerBranding: false, // "Made with LeadNivesh" footer
      supportLevel: 'standard',
    },
  },
  lite: {
    name: 'Lite Starter',
    priceINR: 1999,
    limits: {
      maxListings: 50,
      maxBuyers: 30,
      maxParsesMonthly: 150,
      maxPhotosPerListing: 4,
      flyerBranding: true,
      supportLevel: 'standard',
    },
  },
  pro: {
    name: 'Founder Annual Pass',
    priceINR: 3999,
    limits: {
      maxListings: 10000, // Unlimited for solo brokers
      maxBuyers: 10000,
      maxParsesMonthly: 300, // Fair use
      maxPhotosPerListing: 4,
      flyerBranding: true,
      supportLevel: 'priority',
    },
  },
};

export function getPlanLimits(tier: 'trial' | 'lite' | 'pro' = 'trial'): PlanLimits {
  return PLAN_CONFIGS[tier]?.limits ?? PLAN_CONFIGS.trial.limits;
}

export function isPlanExpired(plan?: { tier: 'trial' | 'lite' | 'pro'; trialEndsAt?: Date; expiresAt?: Date }): boolean {
  if (!plan) return true;
  const now = new Date();
  if (plan.tier === 'trial') {
    return plan.trialEndsAt ? new Date(plan.trialEndsAt) < now : false;
  }
  return plan.expiresAt ? new Date(plan.expiresAt) < now : false;
}

