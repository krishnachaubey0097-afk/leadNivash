import { Property } from '../properties/property.model.js';
import { Buyer } from '../buyers/buyer.model.js';
import { DealService } from '../deals/deal.service.js';
import { ActivityLog } from '../activity/activityLog.model.js';

export class DashboardService {
  static async getTodayData(userId: string) {
    const [
      activeListingsCount,
      activeBuyersCount,
      dealSummary,
      recentActivities,
    ] = await Promise.all([
      Property.countDocuments({ userId, status: 'available', isDeleted: false }),
      Buyer.countDocuments({ userId, status: 'active', isDeleted: false }),
      DealService.getSummary(userId),
      ActivityLog.find({ userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    return {
      activeListingsCount,
      activeBuyersCount,
      pipeline: {
        expectedPipelinePaise: dealSummary.expectedPipelinePaise,
        receivedPaise: dealSummary.receivedPaise,
        pendingPaise: dealSummary.pendingPaise,
      },
      dealCounts: dealSummary.counts,
      recentActivities,
    };
  }
}

