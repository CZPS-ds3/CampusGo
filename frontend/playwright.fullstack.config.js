import { defineConfig } from '@playwright/test';

// One smoke test against the real stack: Vite + Express + MySQL (Docker). `npm run dev` starts all three.
export default defineConfig({
  testDir: './e2e-fullstack',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    permissions: ['geolocation'],
    geolocation: { latitude: 49.1221, longitude: 9.2121, accuracy: 10 },
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'npm run dev',
    cwd: '..',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
