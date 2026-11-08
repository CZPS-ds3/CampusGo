// Environment for the test runner. It refuses every database except the test database.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REPORTS = join(ROOT, 'tests', 'reports');
export const API_PORT = 3100;
export const WEB_PORT = 5175;

const TEST_DB_NAME = 'campusquest_test';
const DEFAULT_URL = `mysql://cq:cq_dev_password@127.0.0.1:3307/${TEST_DB_NAME}`;

/** The test database URL. Throws for a database with another name or a host that is not local. */
export function testDatabaseUrl(env = process.env) {
  const url = env.TEST_DATABASE_URL ?? DEFAULT_URL;
  const parsed = new URL(url);
  const name = parsed.pathname.slice(1);
  const hosts = ['127.0.0.1', 'localhost', ...(env.CI ? ['mysql'] : [])];
  if (name !== TEST_DB_NAME) {
    throw new Error(`refusing database "${name}": the tests may only use "${TEST_DB_NAME}"`);
  }
  if (!hosts.includes(parsed.hostname)) {
    throw new Error(
      `refusing database host "${parsed.hostname}": allowed hosts are ${hosts.join(', ')}`,
    );
  }
  return url;
}

/**
 * Complete environment of the test API. No .env file is read, SMTP is blank (so the development-only
 * /api/dev/last-otp route exists), per-address limits are relaxed and every client may send its own
 * address in X-Forwarded-For (one proxy hop is trusted).
 */
export function apiEnv(dbUrl) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('SMTP_') || key === 'DATABASE_URL') delete env[key];
  }
  return {
    ...env,
    NODE_ENV: 'development',
    PORT: String(API_PORT),
    DATABASE_URL: dbUrl,
    TRUST_PROXY: '1',
    FRONTEND_ORIGIN: `http://localhost:${WEB_PORT}`,
    SMTP_HOST: '',
    OTP_RESEND_COOLDOWN_SECONDS: '0',
    OTP_RESEND_MAX_PER_HOUR: '1000',
    UPLOAD_DIR: join(REPORTS, 'uploads'),
  };
}

/** Environment handed to every test command. */
export function categoryEnv(dbUrl, { apiRunning }) {
  return {
    ...process.env,
    SKIP_DOCKER: '1',
    TEST_DATABASE_URL: dbUrl,
    CQ_TEST_DB_URL: dbUrl,
    CQ_REPORTS_DIR: REPORTS,
    PYTHONUTF8: '1',
    ...(apiRunning ? { CQ_API_URL: `http://127.0.0.1:${API_PORT}` } : {}),
  };
}
