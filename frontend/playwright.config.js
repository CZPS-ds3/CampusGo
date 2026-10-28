import { defineConfig } from '@playwright/test';

const PORT = 5174;
const LIBRARY = { latitude: 49.149493, longitude: 9.216467, accuracy: 10 };

const viewports = {
  'phone-360': { width: 360, height: 740 },
  'phone-390': { width: 390, height: 844 },
  'phone-430': { width: 430, height: 932 },
  'tablet-portrait': { width: 768, height: 1024 },
  'tablet-landscape': { width: 1024, height: 768 },
  'laptop-1280': { width: 1280, height: 800 },
};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-US',
    permissions: ['geolocation'],
    geolocation: LIBRARY,
    trace: 'retain-on-failure',
  },
  projects: Object.entries(viewports).map(([name, viewport]) => ({
    name,
    use: { browserName: 'chromium', viewport, hasTouch: name.startsWith('phone') },
  })),
  webServer: {
    command: `npx cross-env VITE_USE_MOCKS=true vite --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
