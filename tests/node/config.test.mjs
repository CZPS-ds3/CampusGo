// Configuration-level checks with node:test: no port, no database. Run: node --test tests/node/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../../backend/src/app.js';
import { systemClock } from '../../backend/src/clock.js';
import { loadConfig, productionProblems } from '../../backend/src/config.js';
import { describeListenError } from '../../backend/src/listen-error.js';

const quietMailer = { send() {}, verify: async () => ({ ok: true, detail: '' }) };

test('production refuses to start with the development secrets and without an SMTP server', () => {
  const problems = productionProblems(loadConfig({ NODE_ENV: 'production' }));
  assert.ok(problems.length >= 1, 'a production config with default secrets must have problems');
});

test('the lenient geofence defaults are in place and can be tuned by environment', () => {
  const config = loadConfig({ NODE_ENV: 'development' });
  assert.equal(config.maxAccuracyM, 100);
  assert.equal(config.geofenceSlackM, 25);
  assert.equal(config.nearerMarginM, 20);
  assert.equal(loadConfig({ GEOFENCE_SLACK_M: '10' }).geofenceSlackM, 10);
});

test('the administrator address comes from the configuration, in lower case', () => {
  assert.equal(
    loadConfig({ ADMIN_EMAIL: ' Boss@Heilbronn.DHBW.de ' }).adminEmail,
    'boss@heilbronn.dhbw.de',
  );
});

test('start-up errors are explained in plain words', () => {
  assert.match(describeListenError({ code: 'EADDRINUSE' }, 3000), /Port 3000 is already in use/);
  assert.equal(describeListenError(new Error('boom'), 3000), null);
});

test('in production the development-only OTP route does not exist', async () => {
  const config = loadConfig({ NODE_ENV: 'production' });
  const { app } = createApp({ pool: {}, config, mailer: quietMailer, clock: systemClock });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/dev/last-otp?email=a@heilbronn.dhbw.de`,
    );
    const text = await response.text();
    assert.notEqual(response.status, 200);
    assert.ok(!/"otp"/.test(text), 'no code may ever be handed out in production');
  } finally {
    server.close();
  }
});
