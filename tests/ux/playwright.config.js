import { defineConfig } from '@playwright/test';

// UI/UX checks on the web app with its in-browser mock API (its own port, no database needed).
const PORT = 5176;
const CAMPUS_GARDEN = { latitude: 49.147082, longitude: 9.217206, accuracy: 10 };

const viewports = {
  'phone-360': { width: 360, height: 740 },
  'tablet-768': { width: 768, height: 1024 },
  'laptop-1280': { width: 1280, height: 800 },
};

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  outputDir: '../reports/ux',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-US',
    permissions: ['geolocation'],
    geolocation: CAMPUS_GARDEN,
  },
  projects: Object.entries(viewports).map(([name, viewport]) => ({
    name,
    use: { browserName: 'chromium', viewport, hasTouch: name.startsWith('phone') },
  })),
  webServer: {
    command: `npx cross-env VITE_USE_MOCKS=true vite --port ${PORT} --strictPort`,
    cwd: '../../frontend',
    port: PORT,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
