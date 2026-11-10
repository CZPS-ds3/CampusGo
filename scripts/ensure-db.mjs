// Makes sure the MySQL container is running and the schema/seed data exist.
//   node scripts/ensure-db.mjs           start MySQL, migrate + seed the dev database
//   node scripts/ensure-db.mjs --demo    same, plus fictional demo players, teams and activity (development only)
//   node scripts/ensure-db.mjs --test    start MySQL, migrate the test database
//   node scripts/ensure-db.mjs --reset   drop the volume and start from scratch
// Docker Desktop is started for you when it is not running. Set SKIP_DOCKER=1 to use your own MySQL (DATABASE_URL in backend/.env).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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

const dockerRunning = () =>
  spawnSync('docker info', { shell: true, encoding: 'utf8' }).status === 0;

/** Docker Desktop on Windows: the machine-wide install or the per-user install (no admin rights needed). */
function windowsDockerDesktop() {
  const candidates = [
    join(
      process.env.ProgramFiles ?? String.raw`C:\Program Files`,
      'Docker',
      'Docker',
      'Docker Desktop.exe',
    ),
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'Docker Desktop.exe'),
  ];
  const found = candidates.find((path) => existsSync(path));
  return found ? `start "" "${found}"` : null;
}

/** On Windows and macOS, opens Docker Desktop and waits (up to two minutes) until the engine answers. */
function startDockerDesktop() {
  const launch = {
    win32: windowsDockerDesktop(),
    darwin: 'open -a Docker',
  }[process.platform];
  if (!launch) return false;
  console.log('[db] Docker is not running: starting Docker Desktop (this can take a minute) ...');
  spawnSync(launch, { shell: true, stdio: 'ignore' });
  for (let waited = 0; waited < 120; waited += 3) {
    if (dockerRunning()) return true;
    spawnSync(process.platform === 'win32' ? 'ping -n 4 127.0.0.1 >nul' : 'sleep 3', {
      shell: true,
      stdio: 'ignore',
    });
  }
  return false;
}

if (!process.env.SKIP_DOCKER) {
  if (!dockerRunning() && !startDockerDesktop()) {
    fail(
      'Docker is not running. Start Docker Desktop and try again.\n' +
        '     No Docker? Use your own MySQL 8 and set SKIP_DOCKER=1 (see README), or run the UI with: npm run dev:mock',
    );
  }
  if (args.has('--reset')) run('docker compose down -v');
  console.log('[db] starting MySQL (docker compose) ...');
  // Only the database: the backend and frontend containers of docker-compose.yml are for `npm run docker:up`.
  if (run('docker compose up -d --wait mysql').status !== 0)
    fail('MySQL container did not become healthy.');
}

const migrate = args.has('--test')
  ? 'npm run migrate:test --prefix backend'
  : 'npm run migrate --prefix backend';
if (run(migrate).status !== 0) fail('Migration failed.');
if (!args.has('--test') && run('npm run seed --prefix backend').status !== 0)
  fail('Seeding failed.');
if (args.has('--demo') && run('npm run seed:demo --prefix backend').status !== 0)
  fail('Demo data failed.');
console.log('[db] ready.');
