import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const adminLogin = () => ctx.login('sekretariat.dski', { firstName: 'Study', lastName: 'Office' });
const setRole = (actor, student, role) =>
  actor.agent.post(`/api/admin/users/${student.student.id}/role`).send({ role });

describe('BR53 an admin creates, reads, changes and removes roles', () => {
  it('BR53 an admin makes a student an admin, who gets the admin area on the very next request', async () => {
    const admin = await adminLogin();
    const student = await ctx.login('promote.me', { firstName: 'Pia', lastName: 'Promote' });
    await student.agent.get('/api/admin/users').expect(403);

    const res = await setRole(admin, student, 'admin').expect(200);
    expect(res.body.user).toMatchObject({ id: student.student.id, role: 'admin' });
    // The same session works without a new login: the role is read from the database on every request.
    expect((await student.agent.get('/api/me').expect(200)).body.student.role).toBe('admin');
    await student.agent.get('/api/admin/users').expect(200);
    await student.agent.get('/api/admin/stats').expect(200);
    await student.agent.get('/api/admin/checkpoints').expect(200);
    await student.agent.post('/api/me/reset-points').expect(200);
  });

  it('BR53 an admin makes an admin a student again, who loses every admin right at once', async () => {
    const admin = await adminLogin();
    const other = await ctx.login('other.admin');
    await setRole(admin, other, 'admin').expect(200);
    await other.agent.get('/api/admin/users').expect(200);

    await setRole(admin, other, 'student').expect(200);
    await other.agent.get('/api/admin/users').expect(403);
    await other.agent.post('/api/me/reset-points').expect(403);
    expect((await other.agent.get('/api/me').expect(200)).body.student.role).toBe('student');
  });

  it('BR53 a new admin leaves the team, which is repaired; the quiz history is cleared', async () => {
    const admin = await adminLogin();
    const lead = await ctx.login('lead');
    const mate = await ctx.login('mate');
    await lead.agent.post('/api/teams').send({ name: 'Night Owls' }).expect(201);
    await lead.agent.post('/api/teams/me/invitations').send({ email: mate.email }).expect(202);
    const invitation = (await mate.agent.get('/api/invitations')).body.invitations[0];
    await mate.agent.post(`/api/invitations/${invitation.id}/accept`).expect(200);
    await ctx.startAttempt(lead.agent, 'Mensa');

    await setRole(admin, lead, 'admin').expect(200);
    const detail = (await admin.agent.get(`/api/admin/users/${lead.student.id}`).expect(200)).body;
    expect(detail.user).toMatchObject({ role: 'admin', teamId: null, totalPoints: 0 });
    expect(detail.attempts).toEqual([]);
    const team = (await mate.agent.get('/api/teams/me').expect(200)).body.team;
    expect(team).toMatchObject({ size: 1, leaderId: mate.student.id });
    // Administrators are in no ranking.
    const board = (await mate.agent.get('/api/leaderboards/solo').expect(200)).body.entries;
    expect(board.map((e) => e.id)).not.toContain(lead.student.id);
  });

  it('BR53 a student made admin and back is a clean student who can play the quest for real', async () => {
    const admin = await adminLogin();
    const person = await ctx.login('round.trip');
    await setRole(admin, person, 'admin').expect(200);
    const mensa = await ctx.checkpointByName(person.agent, 'Mensa');
    const test = await person.agent.post(`/api/checkpoints/${mensa.id}/verify`).send({
      lat: mensa.latitude,
      lng: mensa.longitude,
      accuracy: 10,
      ageMs: 0,
    });
    expect(test.body.status).toBe('OK'); // admin test mode: an attempt now exists
    await setRole(admin, person, 'student').expect(200);
    const [[{ n }]] = await ctx.pool.query(
      'SELECT COUNT(*) AS n FROM attempts WHERE student_id = ?',
      [person.student.id],
    );
    expect(Number(n)).toBe(0);
    await ctx.startAttempt(person.agent, 'Mensa');
  });

  it('BR53 an admin can be created straight away, filtered by role and counted', async () => {
    const admin = await adminLogin();
    const made = await admin.agent
      .post('/api/admin/users')
      .send({
        email: 'new.admin@heilbronn.dhbw.de',
        firstName: 'Nora',
        lastName: 'Newadmin',
        role: 'admin',
      })
      .expect(201);
    expect(made.body.user.role).toBe('admin');
    const plain = await admin.agent
      .post('/api/admin/users')
      .send({ email: 'plain@heilbronn.dhbw.de', firstName: 'Paul', lastName: 'Plain' })
      .expect(201);
    expect(plain.body.user.role).toBe('student');

    const admins = (await admin.agent.get('/api/admin/users?role=admin').expect(200)).body.users;
    expect(admins.map((u) => u.email).sort()).toEqual([
      'new.admin@heilbronn.dhbw.de',
      'sekretariat.dski@heilbronn.dhbw.de',
    ]);
    const students = (await admin.agent.get('/api/admin/users?role=student').expect(200)).body
      .users;
    expect(students.map((u) => u.email)).toEqual(['plain@heilbronn.dhbw.de']);
    const overview = (await admin.agent.get('/api/admin/overview').expect(200)).body;
    expect(overview.admins).toBe(2);
    expect(overview.users.active).toBe(1);
  });

  it('BR53 nobody can lock the team out: no own role change, the main admin stays admin', async () => {
    const admin = await adminLogin();
    const second = await ctx.login('second.admin');
    await setRole(admin, second, 'admin').expect(200);
    const self = await setRole(admin, admin, 'student');
    expect(self.status).toBe(403);
    // A second admin cannot demote the pre-seeded main admin either.
    const attempt = await second.agent
      .post(`/api/admin/users/${admin.student.id}/role`)
      .send({ role: 'student' });
    expect(attempt.status).toBe(403);
    expect((await admin.agent.get('/api/me').expect(200)).body.student.role).toBe('admin');
  });

  it('BR53 only admins change roles; an unknown role and an unknown account are refused', async () => {
    const admin = await adminLogin();
    const student = await ctx.login('plain.student');
    const victim = await ctx.login('victim');
    await setRole(student, victim, 'admin').expect(403);
    await setRole(student, student, 'admin').expect(403);
    await admin.agent
      .post(`/api/admin/users/${victim.student.id}/role`)
      .send({ role: 'owner' })
      .expect(400);
    await admin.agent.post('/api/admin/users/999999/role').send({ role: 'admin' }).expect(404);
  });

  it('BR53 a role change is written to the activity log and an unchanged role does nothing', async () => {
    const admin = await adminLogin();
    const student = await ctx.login('logged');
    await setRole(admin, student, 'admin').expect(200);
    await setRole(admin, student, 'admin').expect(200); // same role again
    const events = (await admin.agent.get(`/api/admin/users/${student.student.id}`)).body.events;
    const changes = events.filter((e) => e.type === 'role_changed');
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ detail: 'student to admin', byAdmin: true });
  });

  it('BR42 an admin cannot be added to a team by another admin', async () => {
    const admin = await adminLogin();
    const lead = await ctx.login('lead');
    const second = await ctx.login('second.admin');
    await lead.agent.post('/api/teams').send({ name: 'Night Owls' }).expect(201);
    await setRole(admin, second, 'admin').expect(200);
    const teamId = (await lead.agent.get('/api/teams/me')).body.team.id;
    const res = await admin.agent
      .post(`/api/admin/teams/${teamId}/members`)
      .send({ studentId: second.student.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_A_STUDENT');
  });
});
