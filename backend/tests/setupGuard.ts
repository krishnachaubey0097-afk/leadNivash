import { beforeAll } from 'vitest';
import mongoose from 'mongoose';

// Hook mongoose.connect to guarantee tests NEVER connect to remote Atlas DB
const originalConnect = mongoose.connect.bind(mongoose);
mongoose.connect = ((uri: string, options?: any) => {
  if (uri.includes('mongodb+srv') || uri.includes('.mongodb.net')) {
    throw new Error(
      `CRITICAL SAFETY VIOLATION: Refusing to connect to remote/Atlas database (${uri}) during tests! Tests must only connect to MongoMemoryReplSet.`
    );
  }
  return originalConnect(uri, options);
}) as any;

beforeAll(() => {
  if (process.env.MONGODB_URI?.includes('mongodb+srv') || process.env.MONGODB_URI?.includes('.mongodb.net')) {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/leadnivash_test_isolated';
  }
});

