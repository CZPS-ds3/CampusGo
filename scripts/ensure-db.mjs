// Makes sure the MySQL container is running and the schema/seed data exist.
//   node scripts/ensure-db.mjs           start MySQL, migrate + seed the dev database
//   node scripts/ensure-db.mjs --test    start MySQL, migrate the test database
//   node scripts/ensure-db.mjs --reset   drop the volume and start from scratch
// Set SKIP_DOCKER=1 to use your own MySQL (DATABASE_URL in backend/.env).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const run = (cmd, options = {}) =>
  spawnSync(cmd, { cwd: root, stdio: 'inherit', shell: true, ...options });
const fail = (message) => {
  console.error(`\n[db] ${message}\n`);
  process.exit(1);
};

if (!process.env.SKIP_DOCKER) {
  const info = spawnSync('docker info', { shell: true, encoding: 'utf8' });
  if (info.status !== 0) {
    fail(
      'Docker is not running. Start Docker Desktop and try again.\n' +
        '     No Docker? Use your own MySQL 8 and set SKIP_DOCKER=1 (see README), or run the UI with: npm run dev:mock',
    );
  }
  if (args.has('--reset')) run('docker compose down -v');
  console.log('[db] starting MySQL (docker compose) ...');
  if (run('docker compose up -d --wait').status !== 0)
    fail('MySQL container did not become healthy.');
}

const migrate = args.has('--test')
  ? 'npm run migrate:test --prefix backend'
  : 'npm run migrate --prefix backend';
if (run(migrate).status !== 0) fail('Migration failed.');
if (!args.has('--test') && run('npm run seed --prefix backend').status !== 0)
  fail('Seeding failed.');
console.log('[db] ready.');
