import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { backupDatabase, restoreDatabase } from './dbBackupAndRestore.js';

async function testFullBackupRestoreCycle() {
  console.log('====================================================');
  console.log('🔄 TESTING FULL DATABASE BACKUP & RESTORE CYCLE');
  console.log('====================================================\n');

  const testBackupDir = path.resolve(process.cwd(), 'backups', 'controlled-audit-test');
  if (fs.existsSync(testBackupDir)) {
    fs.rmSync(testBackupDir, { recursive: true, force: true });
  }

  // 1. Execute Backup
  console.log('Step 1: Exporting snapshot from live MongoDB...');
  await backupDatabase(testBackupDir);

  const manifestPath = path.join(testBackupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Manifest file was not created!');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  console.log('Backup manifest verified:', Object.keys(manifest));

  // 2. Start isolated MongoMemoryServer
  console.log('\nStep 2: Starting isolated MongoMemoryServer destination...');
  const memServer = await MongoMemoryServer.create();
  const memUri = memServer.getUri();

  // 3. Execute Restore
  console.log('Step 3: Restoring snapshot into memory server at:', memUri);
  await restoreDatabase(testBackupDir, memUri);

  // 4. Verification Check
  console.log('\nStep 4: Verifying parity between backup manifest and restored DB...');
  const testConn = await mongoose.connect(memUri, { dbName: 'leadnivash' });
  const testDb = testConn.connection.db!;

  let totalRestoredCount = 0;
  let allMatched = true;

  for (const [colName, info] of Object.entries(manifest) as [string, any][]) {
    const restoredCount = await testDb.collection(colName).countDocuments();
    const expectedCount = info.count;
    totalRestoredCount += restoredCount;
    const match = restoredCount === expectedCount;
    if (!match) allMatched = false;
    console.log(`  [${colName}]: Expected ${expectedCount} -> Restored ${restoredCount} (${match ? 'MATCH ✅' : 'MISMATCH ❌'})`);
  }

  await testConn.disconnect();
  await memServer.stop();

  // Clean up test directory
  if (fs.existsSync(testBackupDir)) {
    fs.rmSync(testBackupDir, { recursive: true, force: true });
  }

  console.log(`\nParity verification result: ${allMatched ? '100% PERFECT MATCH ✅' : 'FAILED ❌'}`);
  console.log(`Total documents restored across all collections: ${totalRestoredCount}`);
  console.log('\n====================================================');
  console.log('🎉 BACKUP & RESTORE CYCLE COMPLETED SUCCESSFULLY');
  console.log('====================================================');
}

testFullBackupRestoreCycle()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
