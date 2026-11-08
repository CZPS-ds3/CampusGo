import { defineConfig, devices } from '@playwright/test';

// Browser smoke test: Chromium always; Firefox and WebKit when CQ_ALL_BROWSERS=1 (node tests/run-all.mjs --all-browsers).
const PORT = 5177;
const all = process.env.CQ_ALL_BROWSERS === '1';

const projects = [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }];
if (all) {
  projects.push({ name: 'firefox', use: { ...devices['Desktop Firefox'] } });
  projects.push({ name: 'webkit', use: { ...devices['Desktop Safari'] } });
}

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  outputDir: '../reports/browser',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-US',
    permissions: ['geolocation'],
    geolocation: { latitude: 49.147082, longitude: 9.217206, accuracy: 10 },
  },
  projects,
  webServer: {
    command: `npx cross-env VITE_USE_MOCKS=true vite --port ${PORT} --strictPort`,
    cwd: '../../frontend',
    port: PORT,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
