import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { connectDB, disconnectDB } from '../src/config/db.js';

/**
 * LeadNivash Database Backup and Restore Utility
 *
 * Usage:
 *   Backup:  npx tsx scripts/dbBackupAndRestore.ts backup [outputDir]
 *   Restore: npx tsx scripts/dbBackupAndRestore.ts restore <snapshotDir> [targetMongoUri]
 */

const COLLECTIONS_TO_BACKUP = [
  'users',
  'properties',
  'buyers',
  'deals',
  'sharelinks',
  'inquiries',
  'contactleads',
  'localityaliases',
  'usagecounters',
  'activitylogs',
];

export async function backupDatabase(targetDir?: string): Promise<string> {
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection failed');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = targetDir || path.resolve(process.cwd(), 'backups', `backup-${timestamp}`);

  if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath, { recursive: true });
  }

  console.log(`\n📦 Starting full database snapshot from: ${db.databaseName}`);
  console.log(`Target destination: ${backupPath}\n`);

  const manifest: Record<string, { count: number; file: string; exportedAt: string }> = {};

  for (const colName of COLLECTIONS_TO_BACKUP) {
    try {
      const col = db.collection(colName);
      const docs = await col.find({}).toArray();
      const colFile = `${colName}.json`;
      const filePath = path.join(backupPath, colFile);

      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');
      manifest[colName] = {
        count: docs.length,
        file: colFile,
        exportedAt: new Date().toISOString(),
      };
      console.log(`  ✅ [${colName}]: Exported ${docs.length} documents -> ${colFile}`);
    } catch (err: any) {
      console.warn(`  ⚠️ [${colName}]: Error exporting collection: ${err.message}`);
    }
  }

  // Write manifest
  fs.writeFileSync(path.join(backupPath, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\n✅ Snapshot successfully created at: ${backupPath}`);
  await disconnectDB();
  return backupPath;
}

export async function restoreDatabase(snapshotPath: string, targetUri?: string): Promise<void> {
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Snapshot directory does not exist: ${snapshotPath}`);
  }

  const manifestPath = path.join(snapshotPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Invalid snapshot directory: missing manifest.json at ${snapshotPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  console.log(`\n📥 Starting database restoration from snapshot: ${snapshotPath}`);

  // Connect to target DB
  await connectDB(targetUri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Target database connection failed');

  console.log(`Target database: ${db.databaseName}\n`);

  for (const [colName, info] of Object.entries(manifest) as [string, any][]) {
    const colFilePath = path.join(snapshotPath, info.file);
    if (!fs.existsSync(colFilePath)) {
      console.warn(`  ⚠️ Missing data file: ${colFilePath}, skipping`);
      continue;
    }

    const rawDocs = JSON.parse(fs.readFileSync(colFilePath, 'utf-8'));
    if (!Array.isArray(rawDocs) || rawDocs.length === 0) {
      console.log(`  ℹ️ [${colName}]: 0 documents to restore`);
      continue;
    }

    const col = db.collection(colName);

    // Rehydrate ObjectIds and Dates
    const hydratedDocs = rawDocs.map((doc: any) => {
      const rehydrated: any = { ...doc };
      if (doc._id && typeof doc._id === 'string' && doc._id.length === 24) {
        rehydrated._id = new mongoose.Types.ObjectId(doc._id);
      }
      if (doc.userId && typeof doc.userId === 'string' && doc.userId.length === 24) {
        rehydrated.userId = new mongoose.Types.ObjectId(doc.userId);
      }
      if (doc.propertyId && typeof doc.propertyId === 'string' && doc.propertyId.length === 24) {
        rehydrated.propertyId = new mongoose.Types.ObjectId(doc.propertyId);
      }
      if (doc.createdAt) rehydrated.createdAt = new Date(doc.createdAt);
      if (doc.updatedAt) rehydrated.updatedAt = new Date(doc.updatedAt);
      if (doc.deletedAt) rehydrated.deletedAt = new Date(doc.deletedAt);
      return rehydrated;
    });

    // Clean restore using bulk operations / unordered insert
    try {
      const res = await col.insertMany(hydratedDocs, { ordered: false });
      console.log(`  ✅ [${colName}]: Restored ${res.insertedCount} documents`);
    } catch (insertErr: any) {
      if (insertErr.code === 11000) {
        console.log(`  ℹ️ [${colName}]: Partially inserted (duplicate keys skipped)`);
      } else {
        console.warn(`  ⚠️ [${colName}]: Restoration warning: ${insertErr.message}`);
      }
    }
  }

  console.log('\n✅ Database restoration completed successfully.');
  await disconnectDB();
}

// CLI entry point
if (process.argv[1] && process.argv[1].includes('dbBackupAndRestore')) {
  const mode = process.argv[2];
  if (mode === 'backup') {
    const targetDir = process.argv[3];
    backupDatabase(targetDir)
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('Backup failed:', err);
        process.exit(1);
      });
  } else if (mode === 'restore') {
    const snapshotPath = process.argv[3];
    const targetUri = process.argv[4];
    if (!snapshotPath) {
      console.error('Usage: restore <snapshotPath> [targetUri]');
      process.exit(1);
    }
    restoreDatabase(snapshotPath, targetUri)
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('Restore failed:', err);
        process.exit(1);
      });
  } else {
    console.log('Usage:');
    console.log('  npx tsx scripts/dbBackupAndRestore.ts backup [outputDir]');
    console.log('  npx tsx scripts/dbBackupAndRestore.ts restore <snapshotDir> [targetMongoUri]');
    process.exit(0);
  }
}
