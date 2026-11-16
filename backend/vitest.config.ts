import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./tests/setupGuard.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    testTimeout: 60000,
    hookTimeout: 180000,
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/leadnivash_test_isolated',
    },
  },
});

