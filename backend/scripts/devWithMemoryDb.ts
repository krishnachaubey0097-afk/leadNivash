import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { app } from '../src/app.js';
import { connectDB } from '../src/config/db.js';
import { startCronJobs } from '../src/services/cron.service.js';
import { logger } from '../src/services/logger.service.js';
import { env } from '../src/config/env.js';
import { User } from '../src/modules/users/user.model.js';
import { Property } from '../src/modules/properties/property.model.js';
import { ShareLink } from '../src/modules/shares/shareLink.model.js';
import { getPlanLimits } from '../src/config/plans.js';
import bcrypt from 'bcryptjs';

async function seedInitialData(userId: any) {
  // Create sample property
  const prop = await Property.create({
    userId,
    title: '350 Gaj Luxury Built Kothi in Model Town',
    type: 'Kothi',
    category: 'Residential',
    purpose: 'Sale',
    locality: 'Model Town',
    localityKey: 'model-town',
    city: 'Panipat',
    landmark: 'Near Shivaji Stadium',
    size: { value: 350, unit: 'gaj' },
    sizeGaj: 350,
    priceDemandPaise: 3250000000,
    facing: 'East',
    description: 'Newly constructed double-storey luxury kothi with Italian marble, lift provision, modular kitchen, and 3-car parking.',
    tags: ['luxury', 'lift', 'ready-to-move'],
    owner: {
      name: 'Ramesh Chander Chhabra',
      phone: '+919896112233',
      notes: 'Urgent sale due to relocation.',
    },
    status: 'available',
    source: 'manual',
  });

  // Create share link
  await ShareLink.create({
    userId,
    propertyId: prop._id,
    token: 'model-town-luxury-kothi-panipat',
    expiresAt: new Date(Date.now() + 30 * 86400000),
    isRevoked: false,
    viewCount: 12,
  });
}

async function run() {
  logger.info('Starting local in-memory MongoDB replica set (zero setup required)...');
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const uri = replSet.getUri();

  // Override connection to in-memory replica set for this session
  await connectDB(uri);
  logger.info('✅ In-memory MongoDB replica set connected (Transactions enabled)');

  // Seed demo broker & property
  const brokerHash = await bcrypt.hash('Broker@123456', 10);
  const broker = await User.create({
    name: 'Vikram Malhotra',
    email: 'broker@leadnivesh.com',
    passwordHash: brokerHash,
    phone: '+919876543210',
    role: 'user',
    plan: {
      tier: 'pro',
      trialEndsAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      limits: getPlanLimits('pro'),
    },
    agency: {
      name: 'Malhotra Real Estate & Associates',
      city: 'Panipat',
      reraNo: 'HRERA-PKL-PNP-2023-089',
    },
    consent: {
      termsAcceptedAt: new Date(),
      privacyVersion: '1.0',
    },
  });
  await seedInitialData(broker._id);

  // Seed demo admin for testing
  const adminHash = await bcrypt.hash('Admin@123456', 10);
  await User.create({
    name: 'System Administrator',
    email: 'admin@leadnivesh.com',
    passwordHash: adminHash,
    phone: '+919999999999',
    role: 'admin',
    plan: {
      tier: 'pro',
      trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      limits: getPlanLimits('pro'),
    },
    consent: {
      termsAcceptedAt: new Date(),
      privacyVersion: '1.0',
    },
  });
  logger.info('✅ Seeded demo broker & admin users');

  startCronJobs();

  const port = env.PORT || 5000;
  app.listen(port, () => {
    logger.info(`🚀 LeadNivesh API server is LIVE on http://localhost:${port}`);
    logger.info(`Health check: http://localhost:${port}/health`);
    logger.info(`API v1 root:  http://localhost:${port}/api/v1`);
    logger.info(`Flyer demo:   http://localhost:${port}/p/model-town-luxury-kothi-panipat`);
  });
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start in-memory dev server:', err);
  process.exit(1);
});

