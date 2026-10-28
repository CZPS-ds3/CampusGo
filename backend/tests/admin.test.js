import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { findBannedTerm } from '../src/services/name-filter.js';
import { DOMAIN, createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const adminLogin = () => ctx.login('sekretariat.dski', { firstName: 'Study', lastName: 'Office' });

describe('BR27 name rules (German and English)', () => {
  it('BR27 harmless names that contain a banned word are allowed', () => {
    for (const name of [
      'Cass',
      'Classic',
      'Scunthorpe',
      'Assistant',
      'Hancock',
      'Dickens',
      'Hassan',
    ]) {
      expect(findBannedTerm(name), name).toBeNull();
    }
  });

  it('BR27 vulgar words, spelling tricks and German words are blocked', () => {
    for (const name of [
      'Big Ass',
      'BigAss',
      'f.u.c.k',
      '5h1t',
      'fuuuck',
      'Arschloch',
      'Scheiße',
      'Hurensohn',
    ]) {
      expect(findBannedTerm(name), name).not.toBeNull();
    }
  });

  it('BR27 sign-up and team creation refuse a banned nickname or team name', async () => {
    const email = `rude@${DOMAIN}`;
    const agent = request.agent(ctx.app);
    await agent.post('/api/auth/request-otp').send({ email }).expect(200);
    await ctx.mailer.idle();
    const otp = ctx.mailer.lastTo(email).text.match(/\b(\d{6})\b/)[1];
    const res = await agent
      .post('/api/auth/verify')
      .send({ email, otp, firstName: 'Ann', lastName: 'Lee', nickname: 'Scheisskerl' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NAME_NOT_ALLOWED');
    const ok = await ctx.login('polite', { nickname: 'Cass' });
    expect(ok.student.nickname).toBe('Cass');
    const team = await ok.agent.post('/api/teams').send({ name: 'Fuck Squad' });
    expect(team.status).toBe(400);
    expect(team.body.error.code).toBe('NAME_NOT_ALLOWED');
  });
});

describe('BR26 admin area', () => {
  it('BR26 the configured secretariat address becomes admin; others get 403', async () => {
    const admin = await adminLogin();
    expect(admin.student.role).toBe('admin');
    await admin.agent.get('/api/admin/overview').expect(200);
    const student = await ctx.login('student1');
    expect(student.student.role).toBe('student');
    await student.agent.get('/api/admin/users').expect(403);
    await request(ctx.app).get('/api/admin/users').expect(401);
  });

  it('BR26 admin creates, edits and lists users; one e-mail can only belong to one account', async () => {
    const admin = await adminLogin();
    const created = await admin.agent
      .post('/api/admin/users')
      .send({ email: `New.Person@${DOMAIN}`, firstName: 'New', lastName: 'Person' })
      .expect(201);
    expect(created.body.user.email).toBe(`new.person@${DOMAIN}`);
    const dup = await admin.agent
      .post('/api/admin/users')
      .send({ email: `NEW.person@${DOMAIN}`, firstName: 'Other', lastName: 'Person' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
    const second = await admin.agent
      .post('/api/admin/users')
      .send({ email: `second@${DOMAIN}`, firstName: 'Second', lastName: 'Person' })
      .expect(201);
    const clash = await admin.agent
      .patch(`/api/admin/users/${second.body.user.id}`)
      .send({ email: `new.person@${DOMAIN}` });
    expect(clash.status).toBe(409);
    const edited = await admin.agent
      .patch(`/api/admin/users/${second.body.user.id}`)
      .send({ lastName: 'Renamed', nickname: 'Sec' })
      .expect(200);
    expect(edited.body.user.lastName).toBe('Renamed');
    const rude = await admin.agent
      .patch(`/api/admin/users/${second.body.user.id}`)
      .send({ nickname: 'Wichser' });
    expect(rude.status).toBe(400);
    const list = await admin.agent.get('/api/admin/users?q=person').expect(200);
    expect(list.body.users.length).toBeGreaterThanOrEqual(1);
  });

  it('BR26 sign-up with an address that already has an account logs into that account', async () => {
    const first = await ctx.login('same');
    const again = await ctx.login('same');
    expect(again.student.id).toBe(first.student.id);
    const [[{ n }]] = await ctx.pool.query('SELECT COUNT(*) AS n FROM students WHERE email = ?', [
      `same@${DOMAIN}`,
    ]);
    expect(n).toBe(1);
  });

  it('BR28 a blocked user loses the session at once and cannot log in again', async () => {
    const admin = await adminLogin();
    const user = await ctx.login('player');
    await user.agent.get('/api/me').expect(200);
    await admin.agent
      .post(`/api/admin/users/${user.student.id}/status`)
      .send({ status: 'blocked', reason: 'testing' })
      .expect(200);
    await user.agent.get('/api/me').expect(401);
    const email = user.email;
    const agent = request.agent(ctx.app);
    ctx.clock.advance(31_000);
    await agent.post('/api/auth/request-otp').send({ email }).expect(200);
    await ctx.mailer.idle();
    const otp = ctx.mailer.lastTo(email).text.match(/\b(\d{6})\b/)[1];
    const res = await agent.post('/api/auth/verify').send({ email, otp });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_UNAVAILABLE');
    await admin.agent
      .post(`/api/admin/users/${user.student.id}/status`)
      .send({ status: 'active' })
      .expect(200);
  });

  it('BR28 archived users are out of the leaderboard and cannot play', async () => {
    const admin = await adminLogin();
    const user = await ctx.login('oldtimer');
    const other = await ctx.login('other');
    const attempt = await ctx.startAttempt(user.agent, 'Sensoricum');
    await ctx.answerPattern(user.agent, attempt, [true, true, true]);
    let board = await other.agent.get('/api/leaderboards/solo').expect(200);
    expect(board.body.entries.map((e) => e.id)).toContain(user.student.id);
    await admin.agent
      .post(`/api/admin/users/${user.student.id}/status`)
      .send({ status: 'archived' })
      .expect(200);
    board = await other.agent.get('/api/leaderboards/solo').expect(200);
    expect(board.body.entries.map((e) => e.id)).not.toContain(user.student.id);
    await user.agent.get('/api/checkpoints').expect(401);
  });

  it('BR28 an admin can report a user and administrators cannot be blocked', async () => {
    const admin = await adminLogin();
    const user = await ctx.login('reported');
    const res = await admin.agent
      .post(`/api/admin/users/${user.student.id}/report`)
      .send({ reason: 'rude name' })
      .expect(200);
    expect(res.body.user.reported).toBe(true);
    const list = await admin.agent.get('/api/admin/users?status=reported').expect(200);
    expect(list.body.users).toHaveLength(1);
    const self = await admin.agent
      .post(`/api/admin/users/${admin.student.id}/status`)
      .send({ status: 'blocked' });
    expect(self.status).toBe(403);
  });

  it('BR29 the user log shows logins, logouts, sessions and quests', async () => {
    const admin = await adminLogin();
    const user = await ctx.login('logger');
    const attempt = await ctx.startAttempt(user.agent, 'Sensoricum');
    await ctx.answerPattern(user.agent, attempt, [true, true, true]);
    await user.agent.post('/api/auth/logout').expect(204);
    const detail = await admin.agent.get(`/api/admin/users/${user.student.id}`).expect(200);
    const types = detail.body.events.map((e) => e.type);
    expect(types).toContain('login');
    expect(types).toContain('logout');
    expect(detail.body.sessions).toHaveLength(1);
    expect(detail.body.sessions[0].active).toBe(false);
    expect(detail.body.attempts[0]).toMatchObject({
      checkpoint: 'Sensoricum',
      status: 'passed',
    });
    const overview = await admin.agent.get('/api/admin/overview').expect(200);
    expect(overview.body.questsPassedToday).toBeGreaterThanOrEqual(1);
  });

  it('BR27 admin manages teams and banned words', async () => {
    const admin = await adminLogin();
    const lead = await ctx.login('lead');
    const guest = await ctx.login('guest');
    await lead.agent.post('/api/teams').send({ name: 'Night Owls' }).expect(201);
    await lead.agent.post('/api/teams/me/invitations').send({ email: guest.email }).expect(202);
    const { body } = await guest.agent.get('/api/invitations').expect(200);
    await guest.agent.post(`/api/invitations/${body.invitations[0].id}/accept`).expect(200);
    const teams = await admin.agent.get('/api/admin/teams').expect(200);
    expect(teams.body.teams[0].members).toHaveLength(2);
    const teamId = teams.body.teams[0].id;
    await admin.agent.patch(`/api/admin/teams/${teamId}`).send({ name: 'Day Owls' }).expect(204);
    const rude = await admin.agent.patch(`/api/admin/teams/${teamId}`).send({ name: 'Shithead' });
    expect(rude.status).toBe(400);
    await admin.agent.post('/api/admin/names').send({ term: 'Blorp', mode: 'token' }).expect(204);
    const test = await admin.agent
      .post('/api/admin/names/test')
      .send({ text: 'Mr Blorp' })
      .expect(200);
    expect(test.body.blockedBy).toBe('blorp');
    await admin.agent.delete('/api/admin/names/blorp').expect(204);
    await admin.agent.delete(`/api/admin/teams/${teamId}/members/${guest.student.id}`).expect(204);
    await admin.agent.delete(`/api/admin/teams/${teamId}`).expect(204);
    const left = await lead.agent.get('/api/teams/me').expect(200);
    expect(left.body.team).toBeNull();
  });
});

describe('BR30 delete my account', () => {
  it('BR30 deleting removes the person from team, board and sessions and frees the e-mail', async () => {
    const lead = await ctx.login('lead');
    const leaver = await ctx.login('leaver');
    await lead.agent.post('/api/teams').send({ name: 'Night Owls' }).expect(201);
    await lead.agent.post('/api/teams/me/invitations').send({ email: leaver.email }).expect(202);
    const { body } = await leaver.agent.get('/api/invitations').expect(200);
    await leaver.agent.post(`/api/invitations/${body.invitations[0].id}/accept`).expect(200);
    await leaver.agent.delete('/api/me').expect(204);
    await leaver.agent.get('/api/me').expect(401);
    const team = await lead.agent.get('/api/teams/me').expect(200);
    expect(team.body.team.size).toBe(1);
    const board = await lead.agent.get('/api/leaderboards/solo').expect(200);
    expect(board.body.entries.map((e) => e.id)).not.toContain(leaver.student.id);
    const [[row]] = await ctx.pool.query('SELECT * FROM students WHERE student_id = ?', [
      leaver.student.id,
    ]);
    expect(row.status).toBe('deleted');
    expect(row.email).toMatch(/@deleted\.invalid$/);
    expect(row.first_name).toBe('Deleted');
    const again = await ctx.login('leaver', { firstName: 'New', lastName: 'Start' });
    expect(again.student.id).not.toBe(leaver.student.id);
  });

  it('BR30 administrators cannot delete their own account through the app', async () => {
    const admin = await adminLogin();
    await admin.agent.delete('/api/me').expect(403);
  });
});
