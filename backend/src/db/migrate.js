// Applies the SQL files in ./migrations that have not run yet. Usage: node migrate.js [--test]
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig } from '../config.js';
import { createPool } from './pool.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

const RETRYABLE = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'PROTOCOL_CONNECTION_LOST',
]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits until the database accepts connections. A MySQL container (CI service or Docker Desktop) needs a few
 * seconds after it starts, and the first connection must not fail the whole job for that. Gives up after
 * `waitSeconds` and reports the last error; 0 means one try.
 */
export async function waitForDatabase(pool, { waitSeconds = 0, log = console.log } = {}) {
  const deadline = Date.now() + waitSeconds * 1000;
  for (let attempt = 1; ; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      if (!RETRYABLE.has(error.code) || Date.now() >= deadline) throw error;
      if (attempt === 1) log(`[migrate] waiting for the database (up to ${waitSeconds} s)...`);
      await sleep(2000);
    }
  }
}

export async function migrate(databaseUrl, log = console.log, { waitSeconds = 0 } = {}) {
  const pool = createPool(databaseUrl, { multipleStatements: true });
  try {
    await waitForDatabase(pool, { waitSeconds, log });
    await pool.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(100) PRIMARY KEY, applied_at DATETIME(3) NOT NULL)',
    );
    const [rows] = await pool.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((row) => row.name));
    const files = readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const file of files) {
      if (done.has(file)) continue;
      await pool.query(readFileSync(join(dir, file), 'utf8'));
      await pool.query(
        'INSERT INTO schema_migrations (name, applied_at) VALUES (?, UTC_TIMESTAMP(3))',
        [file],
      );
      log(`[migrate] applied ${file}`);
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const useTest = process.argv.includes('--test');
  const config = loadConfig({
    ...process.env,
    NODE_ENV: useTest ? 'test' : (process.env.NODE_ENV ?? 'development'),
  });
  const waitSeconds = Number.parseInt(process.env.DB_WAIT_SECONDS ?? '0', 10) || 0;
  migrate(config.databaseUrl, console.log, { waitSeconds }).catch((error) => {
    console.error(`[migrate] failed: ${error.message}`);
    process.exit(1);
  });
}
