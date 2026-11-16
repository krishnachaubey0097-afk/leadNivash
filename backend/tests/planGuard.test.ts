import { describe, it, expect, vi } from 'vitest';
import { planGuard } from '../src/middleware/planGuard.js';
import { isPlanExpired, getPlanLimits } from '../src/config/plans.js';

describe('Plan & Quota Guard', () => {
  it('correctly calculates trial expiration', () => {
    const expiredTrial = {
      tier: 'trial' as const,
      trialEndsAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    };
    expect(isPlanExpired(expiredTrial)).toBe(true);

    const activeTrial = {
      tier: 'trial' as const,
      trialEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days in future
    };
    expect(isPlanExpired(activeTrial)).toBe(false);
  });

  it('retrieves plan limits correctly', () => {
    const trialLimits = getPlanLimits('trial');
    expect(trialLimits.maxListings).toBe(15);
    expect(trialLimits.maxBuyers).toBe(10);
    expect(trialLimits.flyerBranding).toBe(false);

    const proLimits = getPlanLimits('pro');
    expect(proLimits.flyerBranding).toBe(true);
    expect(proLimits.maxParsesMonthly).toBe(300);
  });

  it('planGuard allows active trial user through', async () => {
    const middleware = planGuard();
    const req: any = {
      user: {
        role: 'user',
        plan: {
          tier: 'trial',
          trialEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        },
      },
    };
    const next = vi.fn();
    await middleware(req, {} as any, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('planGuard blocks expired trial user with 402 PLAN_LIMIT_REACHED', async () => {
    const middleware = planGuard();
    const req: any = {
      user: {
        role: 'user',
        plan: {
          tier: 'trial',
          trialEndsAt: new Date(Date.now() - 1000 * 60 * 60),
        },
      },
    };
    const next = vi.fn();
    await middleware(req, {} as any, next);
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0]![0];
    expect(err.statusCode).toBe(402);
    expect(err.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('planGuard bypasses check for admin user', async () => {
    const middleware = planGuard('flyerBranding');
    const req: any = {
      user: {
        role: 'admin',
        plan: {
          tier: 'trial',
          trialEndsAt: new Date(Date.now() - 1000), // even if expired
        },
      },
    };
    const next = vi.fn();
    await middleware(req, {} as any, next);
    expect(next).toHaveBeenCalledWith();
  });
});

