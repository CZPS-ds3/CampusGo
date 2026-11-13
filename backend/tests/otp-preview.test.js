import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { loadConfig, productionWarnings } from '../src/config.js';
import { createAuthService } from '../src/services/auth.js';
import { createNameRules } from '../src/services/name-rules.js';
import { DOMAIN, createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const adminLogin = () => ctx.login('sekretariat.dski', { firstName: 'Study', lastName: 'Office' });
const codeIn = (mail) => mail.text.match(/\b(\d{6})\b/)[1];

async function switchPreview(on) {
  const admin = await adminLogin();
  const { body } = await admin.agent
    .put('/api/admin/settings')
    .send({ otpPreview: on })
    .expect(200);
  expect(body.settings.otpPreview).toBe(on);
  return admin;
}

describe('BR52 OTP code preview (admin switch)', () => {
  it('BR52 the preview starts off outside development and the test inbox then refuses', async () => {
    const config = await request(ctx.app).get('/api/auth/config').expect(200);
    expect(config.body).toEqual({ otpPreview: false, mailConfigured: true });
    const email = `nobody@${DOMAIN}`;
    await request(ctx.app).post('/api/auth/request-otp').send({ email }).expect(200);
    const res = await request(ctx.app).post('/api/auth/otp-preview').send({ email });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PREVIEW_OFF');
    expect(JSON.stringify(res.body)).not.toMatch(/\d{6}/);
  });

  it('BR01 BR52 with the preview on, the test inbox shows exactly the code that was e-mailed', async () => {
    await switchPreview(true);
    expect((await request(ctx.app).get('/api/auth/config').expect(200)).body.otpPreview).toBe(true);
    const email = `new.player@${DOMAIN}`;
    const visitor = request.agent(ctx.app);
    await visitor.post('/api/auth/request-otp').send({ email }).expect(200);
    await ctx.mailer.idle();
    const mailed = codeIn(ctx.mailer.lastTo(email)); // the real e-mail is still sent
    const { body } = await visitor.post('/api/auth/otp-preview').send({ email }).expect(200);
    expect(body.otp).toBe(mailed);
    const login = await visitor
      .post('/api/auth/verify')
      .send({ email, otp: body.otp, firstName: 'New', lastName: 'Player' });
    expect(login.status).toBe(201);
    // A used code is never shown again.
    const after = await visitor.post('/api/auth/otp-preview').send({ email });
    expect(after.body.error.code).toBe('NO_CODE');
  });

  it('BR01 BR52 after a resend the preview shows the newest code and the old one is refused', async () => {
    await switchPreview(true);
    const email = `resend@${DOMAIN}`;
    const visitor = request.agent(ctx.app);
    await visitor.post('/api/auth/request-otp').send({ email }).expect(200);
    await ctx.mailer.idle();
    const first = codeIn(ctx.mailer.lastTo(email));
    ctx.clock.advance(31_000);
    await visitor.post('/api/auth/request-otp').send({ email }).expect(200);
    await ctx.mailer.idle();
    const second = codeIn(ctx.mailer.lastTo(email));
    const { body } = await visitor.post('/api/auth/otp-preview').send({ email }).expect(200);
    expect(body.otp).toBe(second);
    if (first !== second) {
      const old = await visitor
        .post('/api/auth/verify')
        .send({ email, otp: first, firstName: 'Re', lastName: 'Send' });
      expect(old.body.error.code).toBe('INVALID_CODE');
    }
  });

  it('BR52 an address that asked for nothing, or an expired code, has nothing to show', async () => {
    await switchPreview(true);
    const none = await request(ctx.app)
      .post('/api/auth/otp-preview')
      .send({ email: `silent@${DOMAIN}` });
    expect(none.body.error.code).toBe('NO_CODE');
    const email = `late@${DOMAIN}`;
    await request(ctx.app).post('/api/auth/request-otp').send({ email }).expect(200);
    ctx.clock.advance(11 * 60 * 1000); // the code lives 10 minutes
    const late = await request(ctx.app).post('/api/auth/otp-preview').send({ email });
    expect(late.body.error.code).toBe('NO_CODE');
  });

  it('BR52 turning the preview off hides codes that were already requested', async () => {
    const admin = await switchPreview(true);
    const email = `hide@${DOMAIN}`;
    await request(ctx.app).post('/api/auth/request-otp').send({ email }).expect(200);
    await admin.agent.put('/api/admin/settings').send({ otpPreview: false }).expect(200);
    const res = await request(ctx.app).post('/api/auth/otp-preview').send({ email });
    expect(res.body.error.code).toBe('PREVIEW_OFF');
  });

  it('BR52 BR55 only administrators read or change the setting, and every change is logged', async () => {
    const student = await ctx.login('student');
    await student.agent.get('/api/admin/settings').expect(403);
    await student.agent.put('/api/admin/settings').send({ otpPreview: true }).expect(403);
    const admin = await adminLogin();
    const bad = await admin.agent.put('/api/admin/settings').send({ otpPreview: 'yes' });
    expect(bad.status).toBe(400);
    const { body } = await admin.agent.get('/api/admin/settings').expect(200);
    expect(body.settings).toMatchObject({ otpPreview: false, environment: 'test' });
    await admin.agent.put('/api/admin/settings').send({ otpPreview: true }).expect(200);
    const [[row]] = await ctx.pool.query(
      "SELECT setting_value, updated_by FROM app_settings WHERE setting_key = 'otp_preview'",
    );
    expect(row).toMatchObject({ setting_value: 'true', updated_by: admin.student.id });
    const [[event]] = await ctx.pool.query(
      "SELECT detail FROM audit_events WHERE event_type = 'setting_changed'",
    );
    expect(event.detail).toBe('OTP code preview on');
  });

  it('BR52 without SMTP but with the preview on, nothing is e-mailed and the code is still usable', async () => {
    const mailer = { configured: false, send: vi.fn() };
    const auth = createAuthService({
      pool: ctx.pool,
      config: ctx.config,
      mailer,
      clock: ctx.clock,
      nameRules: createNameRules({ pool: ctx.pool }),
      settings: { otpPreview: async () => true },
    });
    const email = `offline@${DOMAIN}`;
    await auth.requestOtp(email);
    expect(mailer.send).not.toHaveBeenCalled();
    const code = await auth.previewCode(email);
    expect(code).toMatch(/^\d{6}$/);
    const result = await auth.verifyOtp(email, code, { firstName: 'Off', lastName: 'Line' });
    expect(result.status).toBe('ok');
  });

  it('BR52 without SMTP and with the preview off, the mailer is still asked (and reports the missing SMTP)', async () => {
    const mailer = { configured: false, send: vi.fn() };
    const auth = createAuthService({
      pool: ctx.pool,
      config: ctx.config,
      mailer,
      clock: ctx.clock,
      nameRules: createNameRules({ pool: ctx.pool }),
      settings: { otpPreview: async () => false },
    });
    await auth.requestOtp(`quiet@${DOMAIN}`);
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it('BR52 the start value: on in development, off elsewhere, OTP_PREVIEW_DEFAULT overrides it', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).otpPreviewDefault).toBe(true);
    expect(loadConfig({ NODE_ENV: 'production' }).otpPreviewDefault).toBe(false);
    expect(loadConfig({ NODE_ENV: 'test' }).otpPreviewDefault).toBe(false);
    expect(
      loadConfig({ NODE_ENV: 'development', OTP_PREVIEW_DEFAULT: 'false' }).otpPreviewDefault,
    ).toBe(false);
    const risky = loadConfig({ NODE_ENV: 'production', OTP_PREVIEW_DEFAULT: 'true' });
    expect(productionWarnings(risky)[0]).toContain('OTP_PREVIEW_DEFAULT=true');
    expect(productionWarnings(loadConfig({ NODE_ENV: 'production' }))).toEqual([]);
  });
});
