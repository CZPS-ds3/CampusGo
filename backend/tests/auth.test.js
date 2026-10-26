import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DOMAIN, createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const requestOtp = (email) => request(ctx.app).post('/api/auth/request-otp').send({ email });

describe('BR01 BR02 OTP login', () => {
  it('check 1: only addresses that end with the school domain are accepted', async () => {
    for (const bad of [`x@evil${DOMAIN}`, `x@${DOMAIN}.evil.com`, `a@b@${DOMAIN}`]) {
      expect((await requestOtp(bad)).status, bad).toBe(400);
    }
    for (const good of [
      `x@${DOMAIN}`,
      `x@stud.${DOMAIN}`,
      `x+1@${DOMAIN}`,
      `  X@${DOMAIN.toUpperCase()} `,
    ]) {
      expect((await requestOtp(good)).status, good).toBe(200);
    }
  });

  it('check 2 BR02: known and unknown addresses get a byte-identical response', async () => {
    await ctx.login('known');
    ctx.clock.advance(60_000);
    const known = await requestOtp(`known@${DOMAIN}`);
    const unknown = await requestOtp(`nobody@${DOMAIN}`);
    expect(known.status).toBe(unknown.status);
    expect(known.text).toBe(unknown.text);
    expect(known.body.message).toBe(
      'If the account exists, an email containing the OTP has been sent.',
    );
  });

  it('R-33 a second request inside the cooldown sends no new mail but answers the same', async () => {
    await requestOtp(`a@${DOMAIN}`);
    const second = await requestOtp(`a@${DOMAIN}`);
    await ctx.mailer.idle();
    expect(second.status).toBe(200);
    expect(ctx.mailer.outbox.filter((m) => m.to === `a@${DOMAIN}`)).toHaveLength(1);
  });

  it('BR01 the OTP is stored only as a hash', async () => {
    await requestOtp(`h@${DOMAIN}`);
    await ctx.mailer.idle();
    const code = ctx.mailer.lastTo(`h@${DOMAIN}`).text.match(/\b(\d{6})\b/)[1];
    const [rows] = await ctx.pool.query('SELECT code_hash FROM otp_codes WHERE email = ?', [
      `h@${DOMAIN}`,
    ]);
    expect(rows[0].code_hash).not.toContain(code);
    expect(rows[0].code_hash).toHaveLength(64);
  });

  it('check 3: the 6th try fails even with the right code after 5 wrong ones', async () => {
    const email = `lock@${DOMAIN}`;
    await requestOtp(email);
    await ctx.mailer.idle();
    const code = ctx.mailer.lastTo(email).text.match(/\b(\d{6})\b/)[1];
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      const res = await request(ctx.app)
        .post('/api/auth/verify')
        .send({ email, otp: wrong, firstName: 'A', lastName: 'B' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CODE');
    }
    const late = await request(ctx.app)
      .post('/api/auth/verify')
      .send({ email, otp: code, firstName: 'A', lastName: 'B' });
    expect(late.status).toBe(400);
  });

  it('R-33 the code expires after 10 minutes and cannot be reused', async () => {
    const email = `exp@${DOMAIN}`;
    await requestOtp(email);
    await ctx.mailer.idle();
    const code = ctx.mailer.lastTo(email).text.match(/\b(\d{6})\b/)[1];
    ctx.clock.advance(10 * 60 * 1000 + 1);
    const expired = await request(ctx.app)
      .post('/api/auth/verify')
      .send({ email, otp: code, firstName: 'A', lastName: 'B' });
    expect(expired.status).toBe(400);

    const { agent } = await ctx.login('reuse');
    await agent.post('/api/auth/logout').expect(204);
    const used = ctx.mailer.lastTo(`reuse@${DOMAIN}`).text.match(/\b(\d{6})\b/)[1];
    const again = await request(ctx.app)
      .post('/api/auth/verify')
      .send({ email: `reuse@${DOMAIN}`, otp: used });
    expect(again.status).toBe(400);
  });

  it('R-34 an unknown address without names must give a profile first and keeps the code usable', async () => {
    const email = `new@${DOMAIN}`;
    await requestOtp(email);
    await ctx.mailer.idle();
    const otp = ctx.mailer.lastTo(email).text.match(/\b(\d{6})\b/)[1];
    const first = await request(ctx.app).post('/api/auth/verify').send({ email, otp });
    expect(first.body.status).toBe('profile_required');
    const second = await request(ctx.app)
      .post('/api/auth/verify')
      .send({ email, otp, firstName: 'Ada', lastName: 'Lovelace' });
    expect(second.status).toBe(201);
    expect(second.body.student.displayName).toBe('Ada L.');
  });
});

describe('input limits (R-35)', () => {
  it('names and nicknames longer than the database allows are refused with 400, not 500', async () => {
    const email = `long@${DOMAIN}`;
    await requestOtp(email);
    await ctx.mailer.idle();
    const otp = ctx.mailer.lastTo(email).text.match(/\b(\d{6})\b/)[1];
    const res = await request(ctx.app)
      .post('/api/auth/verify')
      .send({ email, otp, firstName: 'A', lastName: 'B', nickname: 'x'.repeat(21) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('unicode and long-but-valid names are stored and shown correctly', async () => {
    const { student } = await ctx.login('uni', { firstName: 'Zoë-Łukasz', lastName: 'Ñandú' });
    expect(student.displayName).toBe('Zoë-Łukasz Ñ.');
  });
});

describe('BR03 sessions', () => {
  it('check 4: a second login ends the first session', async () => {
    const first = await ctx.login('twice');
    await first.agent.get('/api/me').expect(200);
    ctx.clock.advance(60_000);
    const email = `twice@${DOMAIN}`;
    const second = request.agent(ctx.app);
    await second.post('/api/auth/request-otp').send({ email }).expect(200);
    await ctx.mailer.idle();
    const otp = ctx.mailer.lastTo(email).text.match(/\b(\d{6})\b/)[1];
    await second.post('/api/auth/verify').send({ email, otp }).expect(200);
    await second.get('/api/me').expect(200);
    await first.agent.get('/api/me').expect(401);
  });

  it('BR03 a session ends after 30 minutes of inactivity and activity extends it', async () => {
    const { agent } = await ctx.login('idle');
    ctx.clock.advance(29 * 60 * 1000);
    await agent.get('/api/me').expect(200);
    ctx.clock.advance(29 * 60 * 1000);
    await agent.get('/api/me').expect(200);
    ctx.clock.advance(31 * 60 * 1000);
    await agent.get('/api/me').expect(401);
  });

  it('BR03 session tokens are stored only as hashes', async () => {
    const { token: cookie } = await ctx.login('tok');
    const [rows] = await ctx.pool.query('SELECT token_hash FROM sessions');
    expect(cookie).toBeTruthy();
    expect(rows.every((r) => r.token_hash !== cookie)).toBe(true);
  });

  it('BR03 endpoints need a session and logout ends it', async () => {
    await request(ctx.app).get('/api/me').expect(401);
    const { agent } = await ctx.login('out');
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/me').expect(401);
  });
});

describe('profile pictures (R-37)', () => {
  it('rejects a file that is not an image even with an image name', async () => {
    const { agent } = await ctx.login('pic');
    const res = await agent
      .post('/api/me/picture')
      .attach('file', Buffer.from('not an image'), 'x.png');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE');
  });

  it('rejects files above 2 MB', async () => {
    const { agent } = await ctx.login('big');
    const res = await agent
      .post('/api/me/picture')
      .attach('file', Buffer.alloc(2 * 1024 * 1024 + 10), 'x.png');
    expect(res.status).toBe(413);
  });
});
