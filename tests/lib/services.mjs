// Starts and stops the test API (port 3100) and the Vite dev server (port 5175). Only processes that this
// runner started are ever stopped; a foreign process on a port makes the run fail instead.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { API_PORT, REPORTS, ROOT, WEB_PORT, apiEnv } from './env.mjs';

const started = new Map();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: 'localhost' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitFor(url, label, ms = 40_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // not up yet
    }
    await wait(300);
  }
  throw new Error(`${label} did not answer at ${url} within ${ms / 1000} s (see tests/reports/)`);
}

function launch(name, command, args, { cwd, env }) {
  mkdirSync(REPORTS, { recursive: true });
  const log = openSync(join(REPORTS, `${name}.log`), 'w');
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', log, log], windowsHide: true });
  started.set(name, child);
  return child;
}

/** Starts the API on the test database and checks that the development-only OTP route exists. */
export async function startApi(dbUrl) {
  if (started.has('api')) return;
  if (await portInUse(API_PORT)) {
    throw new Error(
      `port ${API_PORT} is already in use: stop the other process, the runner never kills foreign processes`,
    );
  }
  launch('api', process.execPath, ['index.js'], { cwd: join(ROOT, 'backend'), env: apiEnv(dbUrl) });
  await waitFor(`http://127.0.0.1:${API_PORT}/api/health`, 'the API');
  const probe = await fetch(
    `http://127.0.0.1:${API_PORT}/api/dev/last-otp?email=probe@heilbronn.dhbw.de`,
  );
  const body = await probe.json();
  if (body?.error?.message !== 'No code sent yet.') {
    throw new Error(
      'the test API has no /api/dev/last-otp route: is SMTP_HOST empty and NODE_ENV=development?',
    );
  }
}

/** Starts Vite on the web port, proxying /api to the test API. */
export async function startWeb() {
  if (started.has('web')) return;
  if (await portInUse(WEB_PORT)) {
    throw new Error(
      `port ${WEB_PORT} is already in use: stop the other process, the runner never kills foreign processes`,
    );
  }
  launch(
    'web',
    process.execPath,
    [
      join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
      '--port',
      String(WEB_PORT),
      '--strictPort',
    ],
    {
      cwd: join(ROOT, 'frontend'),
      env: { ...process.env, BACKEND_URL: `http://127.0.0.1:${API_PORT}` },
    },
  );
  await waitFor(`http://localhost:${WEB_PORT}/`, 'the web app');
}

function kill(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

export async function stopService(name) {
  const child = started.get(name);
  if (!child) return;
  kill(child);
  started.delete(name);
  await wait(500);
}

/** Stops everything this runner started. */
export async function stopAll() {
  for (const name of [...started.keys()]) await stopService(name);
}

export const isRunning = (name) => started.has(name);
