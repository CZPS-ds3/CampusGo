import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ADMIN_EMAILS, loadConfig } from '../src/config.js';
import { seedAdmins } from '../src/db/seed.js';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const MAIN = 'sekretariat.dski@heilbronn.dhbw.de';
const SHARED = 'dhbw.campus@gmail.com';

/** Logs an existing account in with the e-mailed code (no sign-up form). */
async function codeLogin(email, profile = {}) {
  const agent = request.agent(ctx.app);
  await agent.post('/api/auth/request-otp').send({ email }).expect(200);
  await ctx.mailer.idle();
  const otp = ctx.mailer.lastTo(email).text.match(/\b(\d{6})\b/)[1];
  const res = await agent.post('/api/auth/verify').send({ email, otp, ...profile });
  ctx.clock.advance(31_000);
  return { agent, res };
}

describe('BR37 the list of pre-seeded administrators', () => {
  it('BR37 both admin addresses are the default; the first one is the main admin', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(DEFAULT_ADMIN_EMAILS.split(',')).toEqual([MAIN, SHARED]);
    expect(config.adminEmails).toEqual([MAIN, SHARED]);
    expect(config.adminEmail).toBe(MAIN);
  });

  it('BR37 ADMIN_EMAIL takes a comma-separated list; spaces, capitals and repeats are cleaned, empty means default', () => {
    const list = loadConfig({
      NODE_ENV: 'test',
      ADMIN_EMAIL: ` ${MAIN} , DHBW.Campus@Gmail.com,${MAIN},`,
    });
    expect(list.adminEmails).toEqual([MAIN, SHARED]);
    expect(loadConfig({ NODE_ENV: 'test', ADMIN_EMAIL: MAIN }).adminEmails).toEqual([MAIN]);
    expect(loadConfig({ NODE_ENV: 'test', ADMIN_EMAIL: ' , ' }).adminEmails).toEqual([
      MAIN,
      SHARED,
    ]);
  });

  it('BR37 the seed creates both admins once: the main admin as id 1, the shared mailbox as "Campus Admin"', async () => {
    const ids = await seedAdmins(ctx.pool, [MAIN, SHARED]);
    expect(ids[0]).toBe(1);
    expect(await seedAdmins(ctx.pool, [MAIN, SHARED])).toEqual(ids);
    const [rows] = await ctx.pool.query(
      'SELECT email, role, first_name, last_name FROM students ORDER BY student_id',
    );
    expect(rows).toEqual([
      { email: MAIN, role: 'admin', first_name: 'Study', last_name: 'Office' },
      { email: SHARED, role: 'admin', first_name: 'Campus', last_name: 'Admin' },
    ]);
  });
});

describe('BR01 BR37 the shared admin mailbox logs in outside the school domain', () => {
  it('BR01 BR37 the seeded Gmail admin logs in with the e-mailed code and gets the admin area', async () => {
    await seedAdmins(ctx.pool, ctx.config.adminEmails);
    const { agent, res } = await codeLogin(SHARED);
    expect(res.status).toBe(200);
    expect(res.body.student).toMatchObject({ role: 'admin' });
    await agent.get('/api/admin/users').expect(200);
  });

  it('BR01 BR37 without the seed, the Gmail admin signs up and becomes an admin at once', async () => {
    const { res } = await codeLogin(SHARED, { firstName: 'Campus', lastName: 'Admin' });
    expect([200, 201]).toContain(res.status);
    expect(res.body.student).toMatchObject({ role: 'admin' });
  });

  it('BR01 any other Gmail address is still refused, before and after the code step', async () => {
    const asked = await request(ctx.app)
      .post('/api/auth/request-otp')
      .send({ email: 'dhbw.campus2@gmail.com' });
    expect(asked.status).toBe(400);
    expect(asked.body.error.code).toBe('INVALID_EMAIL');
    expect(ctx.mailer.outbox).toHaveLength(0);
    const verified = await request(ctx.app)
      .post('/api/auth/verify')
      .send({ email: 'someone@gmail.com', otp: '123456' });
    expect(verified.body.error.code).toBe('INVALID_CODE');
  });

  it('BR01 students still cannot be invited with a Gmail address, not even the admin one', async () => {
    const lead = await ctx.login('lead');
    await lead.agent.post('/api/teams').send({ name: 'Night Owls' }).expect(201);
    const res = await lead.agent.post('/api/teams/me/invitations').send({ email: SHARED });
    expect(res.status).toBe(400);
  });
});

describe('BR37 BR53 the shared admin is protected like the main admin', () => {
  it('BR37 another admin cannot demote, block or delete the Gmail admin, and the admin page shows it as protected', async () => {
    await seedAdmins(ctx.pool, ctx.config.adminEmails);
    const { agent } = await codeLogin(MAIN);
    const users = (await agent.get('/api/admin/users').expect(200)).body.users;
    const shared = users.find((u) => u.email === SHARED);
    expect(shared).toMatchObject({ role: 'admin', mainAdmin: true });
    const demote = await agent.post(`/api/admin/users/${shared.id}/role`).send({ role: 'student' });
    expect(demote.status).toBe(403);
    const block = await agent
      .post(`/api/admin/users/${shared.id}/status`)
      .send({ status: 'blocked', reason: 'test' });
    expect(block.status).toBeGreaterThanOrEqual(400);
    await agent.delete(`/api/admin/users/${shared.id}`).expect(403);
    const [[row]] = await ctx.pool.query('SELECT role, status FROM students WHERE email = ?', [
      SHARED,
    ]);
    expect(row).toEqual({ role: 'admin', status: 'active' });
  });

  it('BR37 an admin creating the Gmail address by hand gets an admin account, other Gmail addresses are refused', async () => {
    const { agent } = await codeLogin(MAIN, { firstName: 'Study', lastName: 'Office' });
    const made = await agent
      .post('/api/admin/users')
      .send({ email: SHARED, firstName: 'Campus', lastName: 'Admin' });
    expect(made.status).toBe(201);
    const [[row]] = await ctx.pool.query('SELECT role FROM students WHERE email = ?', [SHARED]);
    expect(row.role).toBe('admin');
    const other = await agent
      .post('/api/admin/users')
      .send({ email: 'other@gmail.com', firstName: 'Other', lastName: 'Person' });
    expect(other.body.error.code).toBe('INVALID_EMAIL');
  });
});
