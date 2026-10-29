// Runs every test category in order and restarts ALL of them when anything fails.
//   node tests/run-all.mjs                      everything, up to 2 restarts (3 attempts)
//   node tests/run-all.mjs --only python-api    some categories (comma separated), still with the restart rule
//   node tests/run-all.mjs --list               the categories
//   options: --retries N   --strict (a pass after a restart still fails)   --ci   --all-browsers
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPORTS, ROOT, categoryEnv, testDatabaseUrl } from './lib/env.mjs';
import { printSummary } from './lib/report.mjs';
import { resetDatabase } from './lib/reset-db.mjs';
import { isRunning, startApi, startWeb, stopAll, stopService } from './lib/services.mjs';

const out = (text = '') => process.stdout.write(`${text}\n`);
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};

const manifest = JSON.parse(readFileSync(join(ROOT, 'tests', 'manifest.json'), 'utf8'));
const only = option('only', '').split(',').filter(Boolean);
const categories = manifest.categories.filter((c) => only.length === 0 || only.includes(c.id));
const retries = Number(option('retries', flag('ci') ? 1 : 2));

if (flag('list')) {
  for (const c of manifest.categories) out(`${c.id.padEnd(16)} ${c.kind.padEnd(12)} ${c.title}`);
  process.exit(0);
}
const unknown = only.filter((id) => !manifest.categories.some((c) => c.id === id));
if (unknown.length > 0) {
  out(`unknown category: ${unknown.join(', ')} (see --list)`);
  process.exit(2);
}

const dbUrl = testDatabaseUrl();
const needs = (c, what) => (c.needs ?? []).includes(what);

/** Last lines of the output with numbers removed: the same failure twice has the same signature. */
const COLOUR_CODES = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
const signature = (tail) =>
  tail
    .split('\n')
    .map((line) => line.replace(COLOUR_CODES, '').replace(/\d+/g, '#').trim())
    .filter(Boolean)
    .slice(-3)
    .join(' | ');

function runCommand(command, env) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, {
      cwd: ROOT,
      env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let tail = '';
    const keep = (chunk) => {
      process.stdout.write(chunk);
      tail = (tail + chunk.toString()).slice(-4000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('close', (code) => resolve({ code: code ?? 1, tail, ms: Date.now() - started }));
  });
}

function ensureDatabaseContainer() {
  if (process.env.SKIP_DOCKER || process.env.CI) return;
  out('[runner] starting MySQL (docker compose up -d --wait)');
  const up = spawnSync('docker compose up -d --wait', { cwd: ROOT, shell: true, stdio: 'inherit' });
  if (up.status !== 0) throw new Error('MySQL did not start: is Docker Desktop running?');
}

let browsersReady = false;
function ensureBrowsers() {
  if (browsersReady) return;
  const list = flag('all-browsers') ? 'chromium firefox webkit' : 'chromium';
  out(`[runner] making sure the Playwright browsers are installed (${list})`);
  const install = spawnSync(`npx playwright install ${list}`, {
    cwd: ROOT,
    shell: true,
    stdio: 'inherit',
  });
  if (install.status !== 0) throw new Error('the Playwright browsers could not be installed');
  browsersReady = true;
}

async function prepare(category) {
  if (needs(category, 'freshdb')) {
    await stopService('api');
    out('[runner] resetting the test database');
    await resetDatabase(dbUrl);
  }
  if (needs(category, 'api')) await startApi(dbUrl);
  if (needs(category, 'web')) await startWeb();
  if (needs(category, 'browsers')) ensureBrowsers();
  if (needs(category, 'build') && !existsSync(join(ROOT, 'frontend', 'dist'))) {
    out('[runner] building the web app first');
    const build = spawnSync('npm run build', { cwd: ROOT, shell: true, stdio: 'inherit' });
    if (build.status !== 0) throw new Error('the build failed');
  }
}

/** One full pass over the categories. Stops at the first failing category. */
async function attempt(number) {
  rmSync(join(ROOT, 'frontend', 'test-results'), { recursive: true, force: true });
  rmSync(join(REPORTS, `attempt-${number}`), { recursive: true, force: true });
  mkdirSync(join(REPORTS, `attempt-${number}`), { recursive: true });
  await stopAll();
  const results = [];
  for (const category of categories) {
    out(`\n=== [attempt ${number}] ${category.id}: ${category.title} ===`);
    let result;
    try {
      await prepare(category);
      const env = {
        ...categoryEnv(dbUrl, { apiRunning: isRunning('api') }),
        ...(flag('all-browsers') ? { CQ_ALL_BROWSERS: '1' } : {}),
      };
      result = await runCommand(category.cmd, env);
    } catch (error) {
      result = { code: 1, tail: `runner error: ${error.message}`, ms: 0 };
      out(result.tail);
    }
    results.push({ id: category.id, kind: category.kind, ...result, ok: result.code === 0 });
    if (result.code !== 0) break;
  }
  await stopAll();
  return results;
}

async function main() {
  mkdirSync(REPORTS, { recursive: true });
  ensureDatabaseContainer();
  const attempts = [];
  let final = 'FAILED';
  for (let n = 1; n <= retries + 1; n += 1) {
    const results = await attempt(n);
    attempts.push(results);
    const failed = results.find((r) => !r.ok);
    if (results.length === categories.length && !failed) {
      final = n === 1 ? 'PASSED' : 'PASSED-AFTER-RETRY';
      break;
    }
    const previous = attempts.at(-2)?.find((r) => !r.ok);
    if (
      previous &&
      previous.id === failed.id &&
      signature(previous.tail) === signature(failed.tail)
    ) {
      out(
        `\n[runner] ${failed.id} failed twice with the same message: a real failure, not a flaky test. Stopping.`,
      );
      final = 'REAL-FAILURE';
      break;
    }
    if (n <= retries)
      out(`\n[runner] ${failed.id} failed: restarting ALL tests (restart ${n} of ${retries})`);
  }
  const summary = printSummary(attempts, final, categories);
  writeFileSync(join(REPORTS, 'summary.json'), JSON.stringify(summary, null, 2));
  const ok = final === 'PASSED' || (final === 'PASSED-AFTER-RETRY' && !flag('strict'));
  process.exitCode = ok ? 0 : 1;
}

process.on('SIGINT', async () => {
  await stopAll();
  process.exit(130);
});

main()
  .catch((error) => {
    out(`[runner] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(stopAll);
