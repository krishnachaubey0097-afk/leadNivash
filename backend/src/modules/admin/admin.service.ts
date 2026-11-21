import { User } from '../users/user.model.js';
import { PLAN_CONFIGS, type PlanTier } from '../../config/plans.js';
import { Property } from '../properties/property.model.js';
import { Buyer } from '../buyers/buyer.model.js';
import { Deal } from '../deals/deal.model.js';
import { ParseLog } from '../parse/parseLog.model.js';
import { ShareLink } from '../shares/shareLink.model.js';
import { Inquiry } from '../inquiries/inquiry.model.js';
import { ActivityLog } from '../activity/activityLog.model.js';
import { isDbConnected } from '../../config/db.js';
import { env } from '../../config/env.js';

export class AdminService {
  /**
   * Lists all users with pagination and search.
   */
  static async listUsers(query: { page?: number; limit?: number; search?: string; tier?: PlanTier }) {
    const page = query.page || 1;
    const limit = Math.min(50, query.limit || 20);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { isDeleted: false };
    if (query.tier) filter['plan.tier'] = query.tier;
    if (query.search && query.search.trim()) {
      filter.$or = [
        { name: { $regex: query.search.trim(), $options: 'i' } },
        { email: { $regex: query.search.trim(), $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-passwordHash -sessions')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Updates a user's plan tier and limits.
   */
  static async updateUserPlan(
    adminUserId: string,
    targetUserId: string,
    tier: PlanTier,
    expiresAt?: string | null
  ) {
    const user = await User.findById(targetUserId);
    if (!user || user.isDeleted) {
      const err: any = new Error('User not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const planConfig = PLAN_CONFIGS[tier] || PLAN_CONFIGS.trial;
    const oldTier = user.plan.tier;

    user.plan.tier = tier;
    user.plan.limits = planConfig.limits;
    user.plan.expiresAt = expiresAt ? new Date(expiresAt) : undefined;
    await user.save();

    await ActivityLog.create({
      userId: adminUserId as any,
      type: 'admin_plan_changed',
      entityType: 'user',
      entityId: user._id,
      meta: {
        targetUserId,
        fromTier: oldTier,
        toTier: tier,
      },
    });

    return {
      userId: user._id.toString(),
      plan: user.plan,
    };
  }

  /**
   * System-wide platform metrics aggregation & operational telemetry.
   */
  static async getPlatformUsage() {
    const now = Date.now();
    const fifteenMinsAgo = new Date(now - 15 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeProperties,
      totalBuyers,
      totalDeals,
      totalParses,
      totalShares,
      onlineUsers,
      active24h,
      active7d,
      active30d,
      recentEvents,
    ] = await Promise.all([
      User.countDocuments({ isDeleted: false }),
      Property.countDocuments({ isDeleted: false, status: 'available' }),
      Buyer.countDocuments({ isDeleted: false, status: 'active' }),
      Deal.countDocuments({ isDeleted: false }),
      ParseLog.countDocuments(),
      ShareLink.countDocuments({ isRevoked: false }),
      User.countDocuments({ isDeleted: false, sessions: { $elemMatch: { lastUsedAt: { $gte: fifteenMinsAgo } } } }),
      User.countDocuments({ isDeleted: false, sessions: { $elemMatch: { lastUsedAt: { $gte: oneDayAgo } } } }),
      User.countDocuments({ isDeleted: false, sessions: { $elemMatch: { lastUsedAt: { $gte: sevenDaysAgo } } } }),
      User.countDocuments({ isDeleted: false, sessions: { $elemMatch: { lastUsedAt: { $gte: thirtyDaysAgo } } } }),
      ActivityLog.find().sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    const mem = process.memoryUsage();

    return {
      overview: {
        totalUsers,
        activeProperties,
        totalBuyers,
        totalDeals,
        totalParses,
        totalShares,
      },
      systemHealth: {
        status: isDbConnected() ? 'healthy' : 'degraded',
        uptimeSeconds: Math.floor(process.uptime()),
        dbConnected: isDbConnected(),
        environment: env.NODE_ENV,
        memoryUsageMb: {
          rss: Math.round(mem.rss / 1024 / 1024),
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        },
      },
      userMetrics: {
        onlineNow: onlineUsers,
        active24h,
        active7d,
        active30d,
      },
      sectionUsage: [
        { section: 'Properties & Inventory', count: activeProperties, unit: 'Available Listings' },
        { section: 'Buyer Lead Management', count: totalBuyers, unit: 'Active Requirements' },
        { section: 'Quick Chat & AI Engine', count: totalParses, unit: 'Analyzed Messages' },
        { section: 'Deal Pipeline Tracking', count: totalDeals, unit: 'Managed Deals' },
        { section: 'Branded WhatsApp Flyers', count: totalShares, unit: 'Live Share Links' },
      ],
      recentEvents: recentEvents.map((e) => ({
        id: e._id.toString(),
        type: e.type,
        entityType: e.entityType || 'system',
        createdAt: e.createdAt,
        meta: e.meta || {},
      })),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Lists inquiries with pagination.
   */
  static async listInquiries(query: { page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = Math.min(50, query.limit || 20);
    const skip = (page - 1) * limit;

    const [inquiries, total] = await Promise.all([
      Inquiry.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Inquiry.countDocuments(),
    ]);

    return {
      inquiries,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
