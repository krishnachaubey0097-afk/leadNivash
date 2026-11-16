import mongoose from 'mongoose';
import { env } from './env.js';

// Global Mongoose security: sanitize query filters against injection
mongoose.set('sanitizeFilter', true);

export async function connectDB(uri = env.MONGODB_URI): Promise<typeof mongoose> {
  // CRITICAL TEST SAFETY GUARD:
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    if (uri.includes('mongodb+srv') || uri.includes('.mongodb.net')) {
      throw new Error(
        `CRITICAL SAFETY VIOLATION: Test execution attempted to connect to remote/Atlas database: ${uri}. Tests must exclusively use mongodb-memory-server.`
      );
    }
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: env.NODE_ENV !== 'production',
      dbName: 'leadnivash',
    });
    return conn;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
