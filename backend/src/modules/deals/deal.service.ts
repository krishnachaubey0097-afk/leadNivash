import { Deal, type IDeal, type DealStage } from './deal.model.js';
import { assertOwnership } from '../../utils/ownershipCheck.js';
import { ActivityLog } from '../activity/activityLog.model.js';

export class DealService {
  /**
   * Compute expected commission in integer paise strictly on server side.
   */
  static calculateExpectedPaise(
    valuePaise: number,
    commission: { mode: 'percent' | 'flat'; bps?: number; flatPaise?: number }
  ): number {
    if (commission.mode === 'percent') {
      const bps = commission.bps || 100; // Default 1% (100 bps)
      return Math.round((valuePaise * bps) / 10000);
    }
    return commission.flatPaise || 0;
  }

  static async create(userId: string, data: any): Promise<IDeal> {
    const expectedPaise = this.calculateExpectedPaise(data.valuePaise, data.commission);

    const deal = new Deal({
      userId,
      buyerId: data.buyerId,
      propertyId: data.propertyId || undefined,
      propertyTitleSnapshot: data.propertyTitleSnapshot.trim(),
      valuePaise: data.valuePaise,
      commission: {
        mode: data.commission.mode,
        bps: data.commission.bps,
        flatPaise: data.commission.flatPaise,
        expectedPaise,
      },
      payments: [],
      stage: data.stage || 'interested',
      stageHistory: [{ stage: data.stage || 'interested', at: new Date() }],
      nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : undefined,
      notes: data.notes?.trim(),
    });

    await deal.save();

    await ActivityLog.create({
      userId,
      type: 'deal_created',
      entityType: 'deal',
      entityId: deal._id,
      meta: { stage: deal.stage, expectedPaise },
    });

    return deal;
  }

  static async list(userId: string, stage?: string) {
    const filter: Record<string, unknown> = { userId, isDeleted: false };
    if (stage) filter.stage = stage;

    return Deal.find(filter).sort({ updatedAt: -1 }).lean();
  }

  static async getById(userId: string, id: string): Promise<IDeal> {
    return assertOwnership(Deal, id, userId);
  }

  static async updateStage(userId: string, id: string, newStage: DealStage, lostReason?: string): Promise<IDeal> {
    const deal = await assertOwnership(Deal, id, userId);

    if (deal.stage === newStage) {
      return deal;
    }

    deal.stage = newStage;
    deal.stageHistory.push({ stage: newStage, at: new Date() });

    if (newStage === 'lost' && lostReason) {
      deal.lostReason = lostReason.trim();
    }

    await deal.save();

    await ActivityLog.create({
      userId,
      type: 'deal_stage_changed',
      entityType: 'deal',
      entityId: deal._id,
      meta: { newStage },
    });

    return deal;
  }

  static async recordPayment(
    userId: string,
    id: string,
    amountPaise: number,
    note?: string,
    receivedAt = new Date()
  ): Promise<IDeal> {
    const deal = await assertOwnership(Deal, id, userId);

    deal.payments.push({
      amountPaise,
      note: note?.trim(),
      receivedAt,
    });

    // If total payments meet or exceed expected, transition to 'paid'
    const totalPaid = deal.payments.reduce((acc, p) => acc + p.amountPaise, 0);
    if (totalPaid >= deal.commission.expectedPaise && deal.stage !== 'paid') {
      deal.stage = 'paid';
      deal.stageHistory.push({ stage: 'paid', at: new Date() });
    }

    await deal.save();

    await ActivityLog.create({
      userId,
      type: 'deal_payment_recorded',
      entityType: 'deal',
      entityId: deal._id,
      meta: { amountPaise, totalPaid },
    });

    return deal;
  }

  /**
   * Commission summary:
   * - Expected pipeline: sum(expectedPaise) strictly EXCLUDING 'lost' deals
   * - Received: sum(payments) across all deals
   * - Pending: expected - received for finalized and paid deals
   */
  static async getSummary(userId: string) {
    const deals = await Deal.find({ userId, isDeleted: false });

    let expectedPipelinePaise = 0;
    let receivedPaise = 0;
    let pendingPaise = 0;

    const counts: Record<string, number> = {
      interested: 0,
      shown: 0,
      negotiating: 0,
      finalized: 0,
      paid: 0,
      lost: 0,
    };

    for (const deal of deals) {
      const stage = deal.stage;
      counts[stage] = (counts[stage] || 0) + 1;

      // ⚠️ Lost deals are EXCLUDED from expected pipeline
      if (stage !== 'lost') {
        expectedPipelinePaise += deal.commission.expectedPaise;
      }

      const totalPaidOnDeal = deal.payments.reduce((acc, p) => acc + p.amountPaise, 0);
      receivedPaise += totalPaidOnDeal;

      if (['finalized', 'paid'].includes(stage)) {
        const remaining = deal.commission.expectedPaise - totalPaidOnDeal;
        if (remaining > 0) {
          pendingPaise += remaining;
        }
      }
    }

    return {
      expectedPipelinePaise,
      receivedPaise,
      pendingPaise,
      counts,
    };
  }

  static async delete(userId: string, id: string): Promise<void> {
    const deal = await assertOwnership(Deal, id, userId);
    deal.isDeleted = true;
    deal.deletedAt = new Date();
    await deal.save();
  }
}

