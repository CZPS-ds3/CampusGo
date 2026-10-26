import { defineConfig } from 'vitest/config';

// All suites share one MySQL test database, so test files must not run in parallel.
export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
