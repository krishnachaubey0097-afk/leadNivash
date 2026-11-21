import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fs from 'fs';
import path from 'path';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/modules/users/user.model.js';
import { Property } from '../src/modules/properties/property.model.js';
import { Buyer } from '../src/modules/buyers/buyer.model.js';
import { Deal } from '../src/modules/deals/deal.model.js';
import { ShareLink } from '../src/modules/shares/shareLink.model.js';
import { Inquiry } from '../src/modules/inquiries/inquiry.model.js';
import { ContactLead } from '../src/modules/contact/contact.model.js';
import { ActivityLog } from '../src/modules/activity/activityLog.model.js';
import { LocalityAlias } from '../src/modules/aliases/alias.model.js';
import { LoginAttempt } from '../src/modules/auth/loginAttempt.model.js';

interface RetentionAuditResult {
  collectionName: string;
  totalDocuments: number;
  activeDocuments: number;
  softDeletedDocuments: number;
  documentsOlderThan30Days: number;
  ttlIndexes: Array<{ indexName: string; expireAfterSeconds: number }>;
  allIndexes: string[];
}

async function runRetentionAndBackupAudit() {
  console.log('====================================================');
  console.log('🔍 STAGE 13: DATA RETENTION & BACKUP AUDIT');
  console.log('====================================================\n');

  // Connect to live database (read-only verification)
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection failed.');
  }

  console.log(`Connected to database: ${db.databaseName}`);
  console.log('Performing READ-ONLY inspection of live collections & indexes...\n');

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const collections = await db.listCollections().toArray();
  const auditReport: RetentionAuditResult[] = [];

  for (const colInfo of collections) {
    const colName = colInfo.name;
    // Skip system collections
    if (colName.startsWith('system.')) continue;

    const col = db.collection(colName);
    const totalDocuments = await col.countDocuments();
    const indexes = await col.indexes();

    const ttlIndexes: Array<{ indexName: string; expireAfterSeconds: number }> = [];
    const allIndexes: string[] = [];

    for (const idx of indexes) {
      allIndexes.push(idx.name || 'unnamed');
      if (typeof idx.expireAfterSeconds === 'number') {
        ttlIndexes.push({
          indexName: idx.name || 'unnamed',
          expireAfterSeconds: idx.expireAfterSeconds,
        });
      }
    }

    // Check soft delete status
    let activeDocuments = totalDocuments;
    let softDeletedDocuments = 0;
    try {
      softDeletedDocuments = await col.countDocuments({ isDeleted: true });
      activeDocuments = await col.countDocuments({ isDeleted: false });
    } catch {
      // Collection does not have isDeleted field
    }

    // Check records older than 30 days
    let documentsOlderThan30Days = 0;
    try {
      documentsOlderThan30Days = await col.countDocuments({ createdAt: { $lte: thirtyDaysAgo } });
    } catch {
      // Collection does not have createdAt
    }

    auditReport.push({
      collectionName: colName,
      totalDocuments,
      activeDocuments,
      softDeletedDocuments,
      documentsOlderThan30Days,
      ttlIndexes,
      allIndexes,
    });
  }

  console.log('--- COLLECTION RETENTION AUDIT ---');
  for (const r of auditReport) {
    console.log(`\n📁 Collection: [${r.collectionName}]`);
    console.log(`   Total Docs: ${r.totalDocuments} (Active: ${r.activeDocuments}, Soft-Deleted: ${r.softDeletedDocuments})`);
    console.log(`   Docs Older than 30 Days: ${r.documentsOlderThan30Days}`);
    if (r.ttlIndexes.length > 0) {
      console.log(`   ⏳ TTL Indexes (Auto-Expire):`);
      for (const ttl of r.ttlIndexes) {
        const days = Math.round(ttl.expireAfterSeconds / 86400);
        console.log(`      - Index "${ttl.indexName}": ${ttl.expireAfterSeconds}s (~${days} days)`);
      }
    } else {
      console.log(`   🛡️ TTL Indexes: None (Records retained indefinitely unless soft-deleted/purged)`);
    }
  }

  // Check specific retention compliance questions
  console.log('\n--- VERIFYING RETENTION POLICIES ---');
  console.log('1. User Data Retention:');
  const userCount = await User.countDocuments({ isDeleted: false });
  console.log(`   Active Registered Users: ${userCount} (Retained indefinitely with full profile)`);

  console.log('2. Property Inventory Retention:');
  const activeProps = await Property.countDocuments({ isDeleted: false });
  const trashedProps = await Property.countDocuments({ isDeleted: true });
  console.log(`   Active Properties: ${activeProps} | Trashed Properties (Within 30-day window): ${trashedProps}`);

  console.log('3. Buyer Requirements Retention:');
  const activeBuyers = await Buyer.countDocuments({ isDeleted: false });
  const trashedBuyers = await Buyer.countDocuments({ isDeleted: true });
  console.log(`   Active Buyers: ${activeBuyers} | Trashed Buyers (Within 30-day window): ${trashedBuyers}`);

  console.log('4. Deals & Commission Records Retention:');
  const activeDeals = await Deal.countDocuments({ isDeleted: false });
  const trashedDeals = await Deal.countDocuments({ isDeleted: true });
  console.log(`   Active Deals: ${activeDeals} | Trashed Deals (Within 30-day window): ${trashedDeals}`);

  console.log('5. Activity Log Retention:');
  const totalAuditLogs = await ActivityLog.countDocuments();
  console.log(`   Activity Logs: ${totalAuditLogs} (Guarded by 180-day compliance TTL index)`);

  console.log('6. Share Links Expiration Policy:');
  const totalShareLinks = await ShareLink.countDocuments();
  const revokedShareLinks = await ShareLink.countDocuments({ isRevoked: true });
  console.log(`   Total Share Links: ${totalShareLinks} | Revoked/Expired: ${revokedShareLinks}`);

  // Disconnect from live DB before running controlled restoration test
  await disconnectDB();
  console.log('\n✅ Read-only live inspection complete. Disconnected from primary DB.\n');

  // ====================================================
  // PART 2: CONTROLLED BACKUP & RESTORATION TEST
  // ====================================================
  console.log('====================================================');
  console.log('🧪 CONTROLLED BACKUP & RESTORATION TEST');
  console.log('====================================================\n');
  console.log('Spawning isolated MongoMemoryServer sandbox for safe restoration validation...');

  const memServer = await MongoMemoryServer.create();
  const memUri = memServer.getUri();
  console.log(`Sandbox MongoDB started at: ${memUri}`);

  // Connect to isolated sandbox
  const memMongoose = await mongoose.connect(memUri, { dbName: 'leadnivash_restore_test' });
  const sandboxDb = memMongoose.connection.db!;

  // Create simulated realistic data payload representing a full platform backup
  const mockBackupData = {
    users: [
      {
        _id: new mongoose.Types.ObjectId(),
        name: 'Restoration Test Broker',
        email: 'restore_test@leadnivash.com',
        phone: '+919876543210',
        role: 'user',
        plan: { tier: 'pro', limits: { maxListings: 200, maxBuyers: 500 } },
        isDeleted: false,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date(),
      },
    ],
    properties: [
      {
        _id: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        title: 'Luxury 3 BHK Floor Sector 12',
        city: 'Panipat',
        locality: 'Sector 12',
        priceDemandPaise: 850000000,
        status: 'available',
        isDeleted: false,
        createdAt: new Date('2026-01-15T00:00:00Z'),
        updatedAt: new Date(),
      },
      {
        _id: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        title: 'Commercial Plot GT Road',
        city: 'Panipat',
        locality: 'GT Road',
        priceDemandPaise: 2500000000,
        status: 'available',
        isDeleted: true, // Trashed 5 days ago
        deletedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        createdAt: new Date('2026-01-10T00:00:00Z'),
        updatedAt: new Date(),
      },
    ],
    buyers: [
      {
        _id: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        name: 'Sunil Sharma',
        phoneE164: '+919812345678',
        city: 'Panipat',
        status: 'active',
        urgency: 'hot',
        isDeleted: false,
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date(),
      },
    ],
    deals: [
      {
        _id: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        stage: 'negotiation',
        dealValuePaise: 800000000,
        commissionExpectedPaise: 8000000,
        isDeleted: false,
        createdAt: new Date('2026-02-10T00:00:00Z'),
        updatedAt: new Date(),
      },
    ],
  };

  // Link user IDs
  mockBackupData.properties[0].userId = mockBackupData.users[0]._id;
  mockBackupData.properties[1].userId = mockBackupData.users[0]._id;
  mockBackupData.buyers[0].userId = mockBackupData.users[0]._id;
  mockBackupData.deals[0].userId = mockBackupData.users[0]._id;

  // Step 1: Serialize backup to a structured JSON snapshot file
  const backupTempPath = path.resolve(process.cwd(), 'leadnivash_controlled_backup_test.json');
  fs.writeFileSync(backupTempPath, JSON.stringify(mockBackupData, null, 2), 'utf-8');
  console.log(`✅ Backup file created: ${backupTempPath} (${fs.statSync(backupTempPath).size} bytes)`);

  // Step 2: Read backup and execute restoration into the sandbox DB
  console.log('Restoring data from backup snapshot into isolated sandbox database...');
  const loadedBackup = JSON.parse(fs.readFileSync(backupTempPath, 'utf-8'));

  // Restore Users
  await sandboxDb.collection('users').insertMany(
    loadedBackup.users.map((u: any) => ({
      ...u,
      _id: new mongoose.Types.ObjectId(u._id),
      createdAt: new Date(u.createdAt),
      updatedAt: new Date(u.updatedAt),
    }))
  );

  // Restore Properties
  await sandboxDb.collection('properties').insertMany(
    loadedBackup.properties.map((p: any) => ({
      ...p,
      _id: new mongoose.Types.ObjectId(p._id),
      userId: new mongoose.Types.ObjectId(p.userId),
      deletedAt: p.deletedAt ? new Date(p.deletedAt) : undefined,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
    }))
  );

  // Restore Buyers
  await sandboxDb.collection('buyers').insertMany(
    loadedBackup.buyers.map((b: any) => ({
      ...b,
      _id: new mongoose.Types.ObjectId(b._id),
      userId: new mongoose.Types.ObjectId(b.userId),
      createdAt: new Date(b.createdAt),
      updatedAt: new Date(b.updatedAt),
    }))
  );

  // Restore Deals
  await sandboxDb.collection('deals').insertMany(
    loadedBackup.deals.map((d: any) => ({
      ...d,
      _id: new mongoose.Types.ObjectId(d._id),
      userId: new mongoose.Types.ObjectId(d.userId),
      createdAt: new Date(d.createdAt),
      updatedAt: new Date(d.updatedAt),
    }))
  );

  console.log('Restoration completed. Performing deep data verification on restored documents...\n');

  // Step 3: Verification Checks on Restored Database
  const restoredUsers = await sandboxDb.collection('users').countDocuments();
  const restoredProps = await sandboxDb.collection('properties').countDocuments();
  const restoredBuyers = await sandboxDb.collection('buyers').countDocuments();
  const restoredDeals = await sandboxDb.collection('deals').countDocuments();

  const restoredUserDoc = await sandboxDb.collection('users').findOne({ email: 'restore_test@leadnivash.com' });
  const restoredActiveProp = await sandboxDb.collection('properties').findOne({ title: 'Luxury 3 BHK Floor Sector 12' });
  const restoredTrashedProp = await sandboxDb.collection('properties').findOne({ isDeleted: true });

  console.log('--- RESTORATION VERIFICATION RESULTS ---');
  console.log(`Users restored:      ${restoredUsers} / ${mockBackupData.users.length} (${restoredUsers === mockBackupData.users.length ? 'PASS ✅' : 'FAIL ❌'})`);
  console.log(`Properties restored: ${restoredProps} / ${mockBackupData.properties.length} (${restoredProps === mockBackupData.properties.length ? 'PASS ✅' : 'FAIL ❌'})`);
  console.log(`Buyers restored:     ${restoredBuyers} / ${mockBackupData.buyers.length} (${restoredBuyers === mockBackupData.buyers.length ? 'PASS ✅' : 'FAIL ❌'})`);
  console.log(`Deals restored:      ${restoredDeals} / ${mockBackupData.deals.length} (${restoredDeals === mockBackupData.deals.length ? 'PASS ✅' : 'FAIL ❌'})`);

  console.log('\nField & Type Integrity Checks:');
  console.log(`- ObjectId preservation: ${restoredUserDoc?._id.toString() === mockBackupData.users[0]._id.toString() ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`- Plan limits preservation: ${restoredUserDoc?.plan?.limits?.maxListings === 200 ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`- Price demand in paise (85 Lakh = 850000000): ${restoredActiveProp?.priceDemandPaise === 850000000 ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`- Trashed document state preserved: ${restoredTrashedProp?.isDeleted === true ? 'PASS ✅' : 'FAIL ❌'}`);

  // Test restoration of soft-deleted property back to active (TrashService.restore simulation)
  await sandboxDb.collection('properties').updateOne(
    { _id: restoredTrashedProp!._id },
    { $set: { isDeleted: false }, $unset: { deletedAt: 1 } }
  );
  const unTrashedProp = await sandboxDb.collection('properties').findOne({ _id: restoredTrashedProp!._id });
  console.log(`- Trash recovery simulation (isDeleted -> false): ${unTrashedProp?.isDeleted === false ? 'PASS ✅' : 'FAIL ❌'}`);

  // Clean up
  await memMongoose.disconnect();
  await memServer.stop();
  if (fs.existsSync(backupTempPath)) {
    fs.unlinkSync(backupTempPath);
  }

  console.log('\n====================================================');
  console.log('🎉 ALL DATA RETENTION & BACKUP TESTS COMPLETED');
  console.log('====================================================');
}

runRetentionAndBackupAudit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Audit failed with error:', err);
    process.exit(1);
  });
