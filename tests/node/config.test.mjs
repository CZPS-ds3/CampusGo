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
  assert.equal(config.maxAccuracyM, 200);
  assert.equal(config.geofenceSlackM, 30);
  assert.equal(config.accuracyCreditM, 50);
  assert.equal(config.nearerMarginM, 20);
  assert.equal(loadConfig({ GEOFENCE_SLACK_M: '10' }).geofenceSlackM, 10);
});

test('BR26 the administrator addresses come from the configuration, in lower case, both by default', () => {
  assert.deepEqual(loadConfig({}).adminEmails, [
    'sekretariat.dski@heilbronn.dhbw.de',
    'dhbw.campusgo@gmail.com',
  ]);
  assert.deepEqual(
    loadConfig({ ADMIN_EMAILS: ' Boss@Heilbronn.DHBW.de , b@gmail.com' }).adminEmails,
    ['boss@heilbronn.dhbw.de', 'b@gmail.com'],
  );
});

test('start-up errors are explained in plain words', () => {
  assert.match(describeListenError({ code: 'EADDRINUSE' }, 3000), /Port 3000 is already in use/);
  assert.equal(describeListenError(new Error('boom'), 3000), null);
});

test('no environment has a route that hands out a login code', async () => {
  const config = loadConfig({ NODE_ENV: 'development' });
  const { app } = createApp({ pool: {}, config, mailer: quietMailer, clock: systemClock });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/dev/last-otp?email=a@heilbronn.dhbw.de`,
    );
    const text = await response.text();
    assert.notEqual(response.status, 200);
    assert.ok(!/"otp"/.test(text), 'no code may ever be handed out');
  } finally {
    server.close();
  }
});

test('every environment keeps the login code limits (30 s apart, 5 per hour)', () => {
  const dev = loadConfig({ NODE_ENV: 'development' });
  assert.equal(dev.otpResendCooldownSeconds, 30);
  assert.equal(dev.otpResendMaxPerHour, 5);
  const withSmtp = loadConfig({ NODE_ENV: 'development', SMTP_HOST: 'smtp.example.org' });
  assert.equal(withSmtp.otpResendCooldownSeconds, 30);
  assert.equal(withSmtp.otpResendMaxPerHour, 5);
  assert.equal(loadConfig({ NODE_ENV: 'production' }).otpResendCooldownSeconds, 30);
  assert.equal(loadConfig({ OTP_RESEND_COOLDOWN_SECONDS: '12' }).otpResendCooldownSeconds, 12);
});
