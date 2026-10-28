import { defineConfig } from 'vitest/config';

// All suites share one MySQL test database, so test files must not run in parallel.
export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    fileParallelism: false,
    // The default forked worker process died now and then on Windows ("Worker exited unexpectedly", about 1 run in 4);
    // worker threads did not in 5 runs in a row.
    pool: 'threads',
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
