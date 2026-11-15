// Security controls that need no database (OWASP Top 10 review). Run with the other suites by `npm test`.
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig, productionProblems } from '../src/config.js';
import { errorHandler } from '../src/middleware/errors.js';
import { createLimiters } from '../src/middleware/rate-limit.js';
import { requireSameOrigin } from '../src/middleware/same-origin.js';
import { otpEmail } from '../src/services/auth.js';
import { createMailer } from '../src/services/mailer.js';

const ORIGIN = 'https://quest.example.org';
const SECRET = 'a'.repeat(64);
const prod = (overrides = {}) =>
  loadConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: SECRET,
    OTP_SECRET: SECRET.replace(/a/g, 'b'),
    SMTP_HOST: 'smtp.example.org',
    FRONTEND_ORIGIN: ORIGIN,
    ...overrides,
  });

describe('A01 cross-site request forgery', () => {
  const app = express();
  app.use(requireSameOrigin(ORIGIN));
  app.all('/x', (_req, res) => res.json({ ok: true }));
  app.use(errorHandler({ isTest: true }));

  it('accepts state-changing requests from the web app itself', async () => {
    await request(app).post('/x').set('Origin', ORIGIN).expect(200);
    await request(app).post('/x').set('Sec-Fetch-Site', 'same-origin').expect(200);
  });

  it('blocks state-changing requests from another site, including sibling subdomains', async () => {
    for (const origin of ['https://evil.example', 'https://other.heilbronn.dhbw.de', 'null']) {
      const res = await request(app).post('/x').set('Origin', origin);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ORIGIN');
    }
    await request(app).post('/x').set('Sec-Fetch-Site', 'cross-site').expect(403);
  });

  it('leaves reads alone', async () => {
    await request(app).get('/x').set('Origin', 'https://evil.example').expect(200);
  });
});

describe('A04 A07 verify rate limit (10 per minute per student)', () => {
  const limits = createLimiters(loadConfig({ NODE_ENV: 'development' }), { enabled: true });
  const app = express();
  app.use((req, _res, next) => {
    req.student = { student_id: Number(req.get('x-student')) };
    next();
  });
  app.post('/verify', limits.verify, (_req, res) => res.json({ ok: true }));

  it('the 11th call in a minute is refused, and the count is per student, not per IP', async () => {
    for (let i = 0; i < 10; i += 1)
      await request(app).post('/verify').set('x-student', '1').expect(200);
    const blocked = await request(app).post('/verify').set('x-student', '1');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY');
    await request(app).post('/verify').set('x-student', '2').expect(200);
  });
});

describe('A05 configuration', () => {
  it('trusts no proxy unless told to, so X-Forwarded-For cannot dodge rate limits', () => {
    expect(loadConfig({}).trustProxy).toBe(false);
    expect(loadConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(loadConfig({ TRUST_PROXY: 'loopback' }).trustProxy).toBe('loopback');
  });

  it('a correct production configuration passes', () => {
    expect(productionProblems(prod())).toEqual([]);
  });

  it('production refuses default secrets, missing SMTP and plain http', () => {
    const problems = productionProblems(
      prod({
        SESSION_SECRET: 'change-me-session-secret',
        OTP_SECRET: 'short',
        SMTP_HOST: '',
        FRONTEND_ORIGIN: 'http://quest.example.org',
      }),
    );
    expect(problems).toHaveLength(4);
  });

  it('development is not checked', () => {
    expect(productionProblems(loadConfig({ NODE_ENV: 'development' }))).toEqual([]);
  });

  it('SMTP uses implicit TLS on 465 and STARTTLS otherwise', () => {
    expect(loadConfig({ SMTP_PORT: '465' }).smtp.secure).toBe(true);
    expect(loadConfig({ SMTP_PORT: '587' }).smtp.secure).toBe(false);
    expect(loadConfig({ SMTP_PORT: '587', SMTP_SECURE: 'true' }).smtp.secure).toBe(true);
  });
});

describe('BR01 OTP e-mail delivery', () => {
  it('sends the code through SMTP with the configured sender', async () => {
    const transport = { sendMail: vi.fn().mockResolvedValue({}), verify: vi.fn() };
    const mailer = createMailer(prod(), { transport });
    mailer.send(otpEmail('ada@heilbronn.dhbw.de', '042137', 10));
    await mailer.idle();
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    const sent = transport.sendMail.mock.calls[0][0];
    expect(sent).toMatchObject({
      from: 'DHBW campusGO <no-reply@localhost>',
      to: 'ada@heilbronn.dhbw.de',
    });
    expect(sent.text).toContain('042137');
    expect(sent.html).toContain('042137');
  });

  it('reports whether the SMTP login works', async () => {
    const ok = createMailer(prod(), { transport: { verify: vi.fn().mockResolvedValue(true) } });
    expect((await ok.verify()).ok).toBe(true);
    const bad = createMailer(prod(), {
      transport: { verify: vi.fn().mockRejectedValue(new Error('535 auth failed')) },
    });
    expect(await bad.verify()).toEqual({ ok: false, detail: 'SMTP check failed: 535 auth failed' });
  });

  it('a delivery failure is logged without the address and never reaches the caller', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = { sendMail: vi.fn().mockRejectedValue(new Error('timeout')) };
    const mailer = createMailer(prod(), { transport });
    mailer.send(otpEmail('ada@heilbronn.dhbw.de', '042137', 10));
    await mailer.idle();
    expect(errors).toHaveBeenCalledWith('[mail] delivery failed: timeout');
    errors.mockRestore();
  });

  it('without SMTP, codes are never printed, only an error is logged, in every environment', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
    for (const NODE_ENV of ['development', 'staging']) {
      const mailer = createMailer(loadConfig({ NODE_ENV }));
      mailer.send(otpEmail('ada@heilbronn.dhbw.de', '042137', 10));
      await mailer.idle();
      expect(mailer.lastTo).toBeUndefined();
      expect((await mailer.verify()).ok).toBe(false);
    }
    expect(errors.mock.calls[0][0]).toContain('no SMTP_HOST configured');
    expect(logs).not.toHaveBeenCalled();
    expect(errors.mock.calls.flat().join(' ')).not.toContain('042137');
    errors.mockRestore();
    logs.mockRestore();
  });
});
