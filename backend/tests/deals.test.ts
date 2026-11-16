import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DealService } from '../src/modules/deals/deal.service.js';
import { Deal } from '../src/modules/deals/deal.model.js';
import { ActivityLog } from '../src/modules/activity/activityLog.model.js';

describe('Deals Module & Commission Math', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ActivityLog, 'create').mockResolvedValue({} as any);
  });

  describe('Server-Side Commission Computation', () => {
    it('computes percentage commission using integer basis points (bps) in paise', () => {
      // 1% of ₹50,00,000 (500000000 paise) = 100 bps -> 50,00,000 paise (₹50,000)
      const expected = DealService.calculateExpectedPaise(500000000, {
        mode: 'percent',
        bps: 100,
      });
      expect(expected).toBe(5000000);

      // 2% (200 bps) of ₹1.35 Cr (1350000000 paise) = 27,00,000 paise (₹2,70,000)
      const expected2 = DealService.calculateExpectedPaise(1350000000, {
        mode: 'percent',
        bps: 200,
      });
      expect(expected2).toBe(27000000);
    });

    it('computes flat commission mode in paise', () => {
      const expected = DealService.calculateExpectedPaise(100000000, {
        mode: 'flat',
        flatPaise: 2500000, // ₹25,000
      });
      expect(expected).toBe(2500000);
    });
  });

  describe('Deals Summary & Lost Pipeline Exclusion (MVP v0 Bug M12 Fix)', () => {
    it('strictly excludes Lost deals from expectedPipelinePaise', async () => {
      const userId = '64a1b2c3d4e5f6a7b8c9d0e1';

      const mockDeals: any[] = [
        // Active finalized deal: expected ₹50,000, received ₹20,000
        {
          stage: 'finalized',
          commission: { expectedPaise: 5000000 },
          payments: [{ amountPaise: 2000000 }],
        },
        // Active negotiating deal: expected ₹1,00,000, received ₹0
        {
          stage: 'negotiating',
          commission: { expectedPaise: 10000000 },
          payments: [],
        },
        // LOST deal: expected was ₹2,00,000 (MUST NOT BE IN EXPECTED PIPELINE!)
        {
          stage: 'lost',
          commission: { expectedPaise: 20000000 },
          payments: [],
        },
      ];

      vi.spyOn(Deal, 'find').mockResolvedValue(mockDeals as any);

      const summary = await DealService.getSummary(userId);

      // Expected pipeline = ₹50,000 + ₹1,00,000 = ₹1,50,000 (15000000 paise)
      // Must NOT include the ₹2,00,000 lost deal!
      expect(summary.expectedPipelinePaise).toBe(15000000);
      expect(summary.receivedPaise).toBe(2000000); // ₹20,000
      expect(summary.pendingPaise).toBe(3000000); // ₹50,000 - ₹20,000 = ₹30,000
      expect(summary.counts.finalized).toBe(1);
      expect(summary.counts.negotiating).toBe(1);
      expect(summary.counts.lost).toBe(1);
    });
  });

  describe('Stage Transitions & Payment Tracking', () => {
    it('records partial payments and transitions to paid when fully received', async () => {
      const mockDeal: any = {
        _id: '64a1b2c3d4e5f6a7b8c9d0e2',
        userId: '64a1b2c3d4e5f6a7b8c9d0e1',
        stage: 'finalized',
        stageHistory: [{ stage: 'finalized', at: new Date() }],
        commission: { expectedPaise: 5000000 },
        payments: [{ amountPaise: 2000000 }],
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Deal, 'findOne').mockResolvedValue(mockDeal);

      // Record final payment of remaining ₹30,000 (3000000 paise)
      const updated = await DealService.recordPayment(
        '64a1b2c3d4e5f6a7b8c9d0e1',
        '64a1b2c3d4e5f6a7b8c9d0e2',
        3000000,
        'Final cheque received'
      );

      expect(updated.payments.length).toBe(2);
      expect(updated.stage).toBe('paid');
      expect(updated.stageHistory.some((h) => h.stage === 'paid')).toBe(true);
      expect(mockDeal.save).toHaveBeenCalled();
    });
  });
});
