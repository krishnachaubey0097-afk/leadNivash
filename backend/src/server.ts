import os from 'os';

// Configure libuv threadpool size to prevent bcrypt/crypto queue starvation under high concurrency
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = String(Math.max(16, (os.cpus()?.length || 4) * 2));
}

import { app } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { startCronJobs, stopCronJobs } from './services/cron.service.js';
import { logger } from './services/logger.service.js';

let server: ReturnType<typeof app.listen> | null = null;

async function bootstrap() {
  try {
    // 1. Connect to Database
    logger.info('Connecting to MongoDB...');
    await connectDB();
    logger.info('✅ MongoDB connected successfully');

    // 2. Start background cron jobs
    startCronJobs();

    // 3. Start listening
    const port = env.PORT;
    server = app.listen(port, '0.0.0.0', () => {
      logger.info(`🚀 LeadNivesh API server listening on http://0.0.0.0:${port}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  stopCronJobs();

  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  await disconnectDB();
  logger.info('Database disconnected. Process exiting.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}

