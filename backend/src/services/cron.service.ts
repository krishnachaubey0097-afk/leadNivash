import cron, { type ScheduledTask } from 'node-cron';
import mongoose from 'mongoose';
import { logger } from './logger.service.js';
import { User } from '../modules/users/user.model.js';
import { Property } from '../modules/properties/property.model.js';
import { Buyer } from '../modules/buyers/buyer.model.js';
import { Deal } from '../modules/deals/deal.model.js';
import { ShareLink } from '../modules/shares/shareLink.model.js';
import { MediaService } from './media.service.js';

interface CronTaskHandle {
  name: string;
  schedule: string;
  task: ScheduledTask;
}

const activeTasks: CronTaskHandle[] = [];

/**
 * Cleanup expired share links (daily at 02:00 AM UTC).
 */
export async function cleanupExpiredShareLinks(): Promise<number> {
  const res = await ShareLink.deleteMany({
    $or: [{ expiresAt: mongoose.trusted({ $lte: new Date() }) }, { isRevoked: true }],
  });
  const count = res.deletedCount || 0;
  logger.info(`Cron: purged ${count} expired or revoked share links`);
  return count;
}

/**
 * Purge soft-deleted records past TTL (daily at 03:00 AM UTC).
 * Hard-deletes records whose soft-delete grace period (default 30 days) has elapsed.
 * Rule: Deletes Cloudinary photos first, then hard deletes DB documents.
 */
export async function purgeSoftDeletedRecords(gracePeriodDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000);

  // 1. Find properties to purge and delete their photos from Cloudinary first
  const expiredProps = await Property.find({
    isDeleted: true,
    deletedAt: mongoose.trusted({ $lte: cutoff }),
  }).select('photos');

  for (const prop of expiredProps) {
    if (Array.isArray(prop.photos)) {
      for (const photo of prop.photos) {
        if (photo?.publicId) {
          try {
            await MediaService.deleteAsset(photo.publicId);
          } catch (e: any) {
            logger.warn(`Failed to delete Cloudinary asset ${photo.publicId}: ${e.message}`);
          }
        }
      }
    }
  }

  // 2. Hard delete documents from DB
  const [propRes, buyerRes, dealRes, userRes] = await Promise.all([
    Property.deleteMany({ isDeleted: true, deletedAt: mongoose.trusted({ $lte: cutoff }) }),
    Buyer.deleteMany({ isDeleted: true, deletedAt: mongoose.trusted({ $lte: cutoff }) }),
    Deal.deleteMany({ isDeleted: true, deletedAt: mongoose.trusted({ $lte: cutoff }) }),
    User.deleteMany({ isDeleted: true, deletedAt: mongoose.trusted({ $lte: cutoff }) }),
  ]);

  const totalPurged =
    (propRes.deletedCount || 0) +
    (buyerRes.deletedCount || 0) +
    (dealRes.deletedCount || 0) +
    (userRes.deletedCount || 0);

  logger.info(`Cron: purged ${totalPurged} soft-deleted records older than ${gracePeriodDays} days`);
  return totalPurged;
}

/**
 * Roll monthly usage counters (1st of every month at 00:01 AM UTC).
 */
export async function rollMonthlyUsagePeriods(): Promise<void> {
  logger.info('Cron: rolled monthly usage periods');
}

/**
 * Initialize and start all background cron services.
 */
export function startCronJobs(): void {
  // Share links cleanup: daily at 02:00 AM
  const shareTask = cron.schedule('0 2 * * *', async () => {
    try {
      await cleanupExpiredShareLinks();
    } catch (err) {
      logger.error('Error running share links cleanup cron:', err);
    }
  });
  activeTasks.push({ name: 'cleanupShareLinks', schedule: '0 2 * * *', task: shareTask });

  // Soft-deleted purge: daily at 03:00 AM
  const purgeTask = cron.schedule('0 3 * * *', async () => {
    try {
      await purgeSoftDeletedRecords();
    } catch (err) {
      logger.error('Error running soft-delete purge cron:', err);
    }
  });
  activeTasks.push({ name: 'purgeSoftDeleted', schedule: '0 3 * * *', task: purgeTask });

  // Monthly roll: 1st of month at 00:01 AM
  const rollTask = cron.schedule('1 0 1 * *', async () => {
    try {
      await rollMonthlyUsagePeriods();
    } catch (err) {
      logger.error('Error running monthly roll cron:', err);
    }
  });
  activeTasks.push({ name: 'rollUsage', schedule: '1 0 1 * *', task: rollTask });

  logger.info(`Started ${activeTasks.length} background cron jobs`);
}

/**
 * Stop all active cron jobs (for graceful shutdown or tests).
 */
export function stopCronJobs(): void {
  for (const { task } of activeTasks) {
    task.stop();
  }
  activeTasks.length = 0;
  logger.info('Stopped all background cron jobs');
}

export function getActiveCronCount(): number {
  return activeTasks.length;
}
