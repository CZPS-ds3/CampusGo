// Applies the SQL files in ./migrations that have not run yet. Usage: node migrate.js [--test]
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig } from '../config.js';
import { createPool } from './pool.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate(databaseUrl, log = console.log) {
  const pool = createPool(databaseUrl, { multipleStatements: true });
  try {
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
  migrate(config.databaseUrl).catch((error) => {
    console.error(`[migrate] failed: ${error.message}`);
    process.exit(1);
  });
}
