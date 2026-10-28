// Runs after `npm install` (postinstall). Creates local .env files so the app can start.
// Never fails the install: problems are printed as hints.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const log = (msg) => console.log(`[setup] ${msg}`);

try {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) log(`Node ${process.versions.node} is too old. Install Node 20 or newer.`);

  for (const dir of ['backend', 'frontend']) {
    const example = join(root, dir, '.env.example');
    const target = join(root, dir, '.env');
    if (!existsSync(example) || existsSync(target)) continue;
    copyFileSync(example, target);
    if (dir === 'backend') {
      const secret = () => randomBytes(32).toString('hex');
      let text = readFileSync(target, 'utf8');
      text = text
        .replace('change-me-session-secret', secret())
        .replace('change-me-otp-secret', secret());
      writeFileSync(target, text);
    }
    log(`created ${dir}/.env from ${dir}/.env.example`);
  }

  const docker = spawnSync('docker', ['--version'], { encoding: 'utf8', shell: true });
  if (docker.status !== 0) {
    log('Docker was not found. Install Docker Desktop to run the MySQL database (see README).');
    log('Without Docker you can still run the UI with mock data: npm run dev:mock');
  } else if (!process.env.CI) {
    log(
      'Done. Start everything with: npm run dev   (MySQL, migrations and seed start automatically)',
    );
  }
} catch (error) {
  log(`skipped (${error.message}). Run "npm run setup" later.`);
}
