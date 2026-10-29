import { defineConfig } from '@playwright/test';

// The existing full-stack specs (frontend/e2e-fullstack) against the runner's own stack: API on port 3100 with
// the test database and Vite on port 5175. No server is started here and none is reused, so this can never
// reach the development stack on ports 3000 and 5173.
export default defineConfig({
  testDir: '../../frontend/e2e-fullstack',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list']],
  outputDir: '../reports/e2e-fullstack',
  use: {
    baseURL: 'http://localhost:5175',
    locale: 'en-US',
    permissions: ['geolocation'],
    geolocation: { latitude: 49.147082, longitude: 9.217206, accuracy: 10 }, // Campus Garden
    viewport: { width: 390, height: 844 },
  },
});
