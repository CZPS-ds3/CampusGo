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
    locale: 'en-US',
    permissions: ['geolocation'],
    geolocation: { latitude: 49.147082, longitude: 9.217206, accuracy: 10 }, // Campus Garden
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'npm run dev',
    cwd: '..',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 240_000,
    // The admin test signs in with the same address on every run, so the resend cooldown and the hourly code
    // limit of that address are relaxed for the server that Playwright starts (a server that is already running
    // keeps its own limits).
    env: { OTP_RESEND_COOLDOWN_SECONDS: '1', OTP_RESEND_MAX_PER_HOUR: '1000' },
  },
});
