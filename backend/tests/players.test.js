import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedAdmin } from '../src/db/seed.js';
import { DOMAIN, createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const adminLogin = () => ctx.login('sekretariat.dski', { firstName: 'Study', lastName: 'Office' });

describe('BR36 player profiles', () => {
  it('BR36 a profile shows points, solo rank, team, team rank and members, but no e-mail or last name', async () => {
    const lead = await ctx.login('lead', {
      firstName: 'Anna',
      lastName: 'Schmidt',
      nickname: 'Anni',
    });
    const mate = await ctx.login('mate', { firstName: 'Ben', lastName: 'Weber' });
    const viewer = await ctx.login('viewer');
    await lead.agent.post('/api/teams').send({ name: 'Night Owls' }).expect(201);
    await lead.agent.post('/api/teams/me/invitations').send({ email: mate.email }).expect(202);
    const invites = await mate.agent.get('/api/invitations').expect(200);
    await mate.agent.post(`/api/invitations/${invites.body.invitations[0].id}/accept`).expect(200);
    const attempt = await ctx.startAttempt(lead.agent, 'Sensoricum');
    await ctx.answerPattern(lead.agent, attempt, [true, true, true]);

    const res = await viewer.agent.get(`/api/players/${lead.student.id}`).expect(200);
    const { player } = res.body;
    expect(player.displayName).toBe('Anni');
    expect(player.totalPoints).toBeGreaterThan(0);
    expect(player.rank).toBe(1);
    expect(player.questsCleared).toBe(1);
    expect(player.team.name).toBe('Night Owls');
    expect(player.team.rank).toBe(1);
    expect(player.team.members.map((m) => m.displayName)).toEqual(['Anni', 'Ben W.']);
    const shown = JSON.stringify(res.body);
    expect(shown).not.toContain('Schmidt');
    expect(shown).not.toContain('Weber');
    expect(shown).not.toContain(DOMAIN);
  });

  it('BR36 a team member can invite a player from the profile; the team sees the name, not an address', async () => {
    const lead = await ctx.login('lead');
    const guest = await ctx.login('guest', { nickname: 'Gus' });
    await lead.agent.post('/api/teams').send({ name: 'Night Owls' }).expect(201);
    const before = await lead.agent.get(`/api/players/${guest.student.id}`).expect(200);
    expect(before.body.player.canInvite).toBe(true);
    await lead.agent
      .post('/api/teams/me/invitations')
      .send({ playerId: guest.student.id })
      .expect(202);
    const team = await lead.agent.get('/api/teams/me').expect(200);
    expect(team.body.team.pending[0]).toMatchObject({ invitedEmail: null, displayName: 'Gus' });
    // A second invitation for the same player is ignored as a duplicate.
    await lead.agent
      .post('/api/teams/me/invitations')
      .send({ playerId: guest.student.id })
      .expect(202);
    expect((await guest.agent.get('/api/invitations')).body.invitations).toHaveLength(1);
    const noBody = await lead.agent.post('/api/teams/me/invitations').send({});
    expect(noBody.status).toBe(400);
  });

  it('BR36 no invite button without a team or for yourself; admins have no profile', async () => {
    const lead = await ctx.login('lead');
    const other = await ctx.login('other');
    const admin = await adminLogin();
    const noTeam = await lead.agent.get(`/api/players/${other.student.id}`);
    expect(noTeam.body.player.canInvite).toBe(false);
    const self = await lead.agent.get(`/api/players/${lead.student.id}`);
    expect(self.body.player).toMatchObject({ isYou: true, canInvite: false });
    await lead.agent.get(`/api/players/${admin.student.id}`).expect(404);
    await request(ctx.app).get(`/api/players/${other.student.id}`).expect(401);
  });
});

describe('BR37 the administrator account exists from the start', () => {
  it('BR37 seedAdmin creates the account once, as id 1 when free, and login needs no sign-up form', async () => {
    const [email] = ctx.config.adminEmails;
    const id = await seedAdmin(ctx.pool, email);
    expect(id).toBe(1);
    expect(await seedAdmin(ctx.pool, email)).toBe(1);
    const agent = request.agent(ctx.app);
    await agent.post('/api/auth/request-otp').send({ email }).expect(200);
    await ctx.mailer.idle();
    const otp = ctx.mailer.lastTo(email).text.match(/\b(\d{6})\b/)[1];
    const res = await agent.post('/api/auth/verify').send({ email, otp }).expect(200);
    expect(res.body.student).toMatchObject({ id: 1, role: 'admin' });
  });

  it('BR26 BR37 every listed admin is seeded, may log in from outside the school domain and stays an admin', async () => {
    const gmail = 'dhbw.campusgo@gmail.com';
    expect(ctx.config.adminEmails).toContain('sekretariat.dski@heilbronn.dhbw.de');
    expect(ctx.config.adminEmails).toContain(gmail);
    const id = await seedAdmin(ctx.pool, gmail, ['Campus', 'GO'], { main: false });
    expect(id).not.toBe(1);
    const agent = request.agent(ctx.app);
    await agent.post('/api/auth/request-otp').send({ email: gmail }).expect(200);
    await ctx.mailer.idle();
    const otp = ctx.mailer.lastTo(gmail).text.match(/\b(\d{6})\b/)[1];
    const res = await agent.post('/api/auth/verify').send({ email: gmail, otp }).expect(200);
    expect(res.body.student).toMatchObject({ id, role: 'admin' });
    // Any other address outside the school domain is still refused (R-31).
    await request(ctx.app)
      .post('/api/auth/request-otp')
      .send({ email: 'someone@gmail.com' })
      .expect(400);
    // Another admin cannot make it a student, so it can never be deleted either.
    const admin = await adminLogin();
    await admin.agent.post(`/api/admin/users/${id}/role`).send({ role: 'student' }).expect(403);
  });

  it('BR37 the administrator cannot be deleted through the app, the admin area or the account service', async () => {
    const admin = await adminLogin();
    await admin.agent.delete('/api/me').expect(403);
    await admin.agent.delete(`/api/admin/users/${admin.student.id}`).expect(403);
    await expect(ctx.services.accounts.deleteAccount(admin.student.id)).rejects.toMatchObject({
      status: 403,
    });
    const [[row]] = await ctx.pool.query('SELECT status, role FROM students WHERE student_id = ?', [
      admin.student.id,
    ]);
    expect(row).toMatchObject({ status: 'active', role: 'admin' });
  });
});

describe('BR38 admin test mode', () => {
  it('BR38 an admin starts any quiz from anywhere, even an inactive checkpoint, and can repeat it', async () => {
    const admin = await adminLogin();
    const library = await ctx.checkpointByName(admin.agent, 'Library');
    await ctx.pool.query('UPDATE checkpoints SET is_active = 0 WHERE checkpoint_id = ?', [
      library.id,
    ]);
    const listed = await ctx.checkpointByName(admin.agent, 'Library');
    expect(listed.isActive).toBe(false);
    for (let round = 0; round < 2; round += 1) {
      const res = await admin.agent
        .post(`/api/checkpoints/${library.id}/verify`)
        .send({ lat: 0, lng: 0, accuracy: 5000, ageMs: 0 })
        .expect(200);
      expect(res.body.status).toBe('OK');
      await ctx.answerPattern(admin.agent, res.body.attempt, [true, true, true, true, true]);
    }
  });

  it('BR38 students still need the location: far away or inactive gives no quiz', async () => {
    const student = await ctx.login('student');
    const library = await ctx.checkpointByName(student.agent, 'Library');
    await student.agent.post('/api/me/location-consent').expect(204);
    const far = await student.agent
      .post(`/api/checkpoints/${library.id}/verify`)
      .send({ lat: 48.0, lng: 9.0, accuracy: 10, ageMs: 0 })
      .expect(200);
    expect(far.body.status).toBe('OUTSIDE');
    await ctx.pool.query('UPDATE checkpoints SET is_active = 0 WHERE checkpoint_id = ?', [
      library.id,
    ]);
    await student.agent
      .post(`/api/checkpoints/${library.id}/verify`)
      .send({ lat: library.latitude, lng: library.longitude, accuracy: 10, ageMs: 0 })
      .expect(404);
  });
});
