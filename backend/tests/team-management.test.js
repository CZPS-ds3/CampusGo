import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const adminLogin = () => ctx.login('sekretariat.dski', { firstName: 'Study', lastName: 'Office' });

async function makeTeam(lead, mates, name = 'Night Owls') {
  await lead.agent.post('/api/teams').send({ name }).expect(201);
  for (const mate of mates) {
    await lead.agent.post('/api/teams/me/invitations').send({ email: mate.email }).expect(202);
    const { body } = await mate.agent.get('/api/invitations').expect(200);
    await mate.agent.post(`/api/invitations/${body.invitations.at(-1).id}/accept`).expect(200);
    ctx.clock.advance(1000); // a clear join order
  }
}

describe('BR44 the team leader manages the team', () => {
  it('BR44 the person who created the team is the leader and can remove a member', async () => {
    const lead = await ctx.login('lead');
    const mate = await ctx.login('mate');
    const other = await ctx.login('other');
    await makeTeam(lead, [mate, other]);
    const team = (await lead.agent.get('/api/teams/me').expect(200)).body.team;
    expect(team.leaderId).toBe(lead.student.id);

    const res = await lead.agent.delete(`/api/teams/me/members/${other.student.id}`).expect(200);
    expect(res.body.team.members.map((m) => m.id)).toEqual([lead.student.id, mate.student.id]);
    expect((await other.agent.get('/api/teams/me').expect(200)).body.team).toBeNull();
    const [[event]] = await ctx.pool.query(
      "SELECT actor_id, student_id FROM audit_events WHERE event_type = 'removed_from_team'",
    );
    expect(event).toMatchObject({ actor_id: lead.student.id, student_id: other.student.id });
  });

  it('BR44 other members cannot remove anyone, and the leader cannot remove themselves', async () => {
    const lead = await ctx.login('lead');
    const mate = await ctx.login('mate');
    const other = await ctx.login('other');
    await makeTeam(lead, [mate, other]);
    const blocked = await mate.agent.delete(`/api/teams/me/members/${other.student.id}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('NOT_LEADER');
    const self = await lead.agent.delete(`/api/teams/me/members/${lead.student.id}`);
    expect(self.status).toBe(400);
    const stranger = await ctx.login('stranger');
    await lead.agent.delete(`/api/teams/me/members/${stranger.student.id}`).expect(404);
    await request(ctx.app).delete(`/api/teams/me/members/${mate.student.id}`).expect(401);
  });

  it('BR44 removing a member recalculates the team score', async () => {
    const lead = await ctx.login('lead');
    const mate = await ctx.login('mate');
    await makeTeam(lead, [mate]);
    await ctx.pool.query('UPDATE students SET total_points = 1000 WHERE student_id = ?', [
      lead.student.id,
    ]);
    await ctx.pool.query('UPDATE students SET total_points = 0 WHERE student_id = ?', [
      mate.student.id,
    ]);
    await lead.agent.delete(`/api/teams/me/members/${mate.student.id}`).expect(200);
    const [[team]] = await ctx.pool.query('SELECT team_score FROM teams');
    expect(team.team_score).toBe(1000);
  });

  it('BR44 leadership passes to the earliest active member when the leader is blocked', async () => {
    const admin = await adminLogin();
    const lead = await ctx.login('lead');
    const first = await ctx.login('first');
    const second = await ctx.login('second');
    await makeTeam(lead, [first, second]);
    await admin.agent
      .post(`/api/admin/users/${lead.student.id}/status`)
      .send({ status: 'blocked' })
      .expect(200);
    const team = (await first.agent.get('/api/teams/me').expect(200)).body.team;
    expect(team.leaderId).toBe(first.student.id);
    await first.agent.delete(`/api/teams/me/members/${second.student.id}`).expect(200);
  });
});

describe('BR45 any member cancels a pending invitation', () => {
  it('BR45 a member who is not the leader can cancel an invitation the leader sent', async () => {
    const lead = await ctx.login('lead');
    const mate = await ctx.login('mate');
    const guest = await ctx.login('guest');
    await makeTeam(lead, [mate]);
    await lead.agent.post('/api/teams/me/invitations').send({ email: guest.email }).expect(202);
    const pending = (await mate.agent.get('/api/teams/me').expect(200)).body.team.pending;
    expect(pending).toHaveLength(1);
    await mate.agent.post(`/api/teams/me/invitations/${pending[0].id}/cancel`).expect(200);
    expect((await guest.agent.get('/api/invitations').expect(200)).body.invitations).toEqual([]);
    expect((await lead.agent.get('/api/teams/me').expect(200)).body.team.pending).toEqual([]);
    const [[row]] = await ctx.pool.query(
      'SELECT status FROM team_invitations WHERE invitee_id = ?',
      [guest.student.id],
    );
    expect(row.status).toBe('cancelled');
    const again = await mate.agent.post(`/api/teams/me/invitations/${pending[0].id}/cancel`);
    expect(again.status).toBe(409);
  });

  it('BR45 someone outside the team cannot cancel its invitations; a cancelled invitation cannot be accepted', async () => {
    const lead = await ctx.login('lead');
    const guest = await ctx.login('guest');
    const outsider = await ctx.login('outsider');
    await makeTeam(lead, []);
    await lead.agent.post('/api/teams/me/invitations').send({ email: guest.email }).expect(202);
    const invitation = (await guest.agent.get('/api/invitations').expect(200)).body.invitations[0];
    await outsider.agent.post(`/api/teams/me/invitations/${invitation.id}/cancel`).expect(404);
    await lead.agent.post(`/api/teams/me/invitations/${invitation.id}/cancel`).expect(200);
    const late = await guest.agent.post(`/api/invitations/${invitation.id}/accept`);
    expect(late.status).toBe(409);
  });

  it('BR45 a cancelled invitation frees its place for another invitation', async () => {
    const lead = await ctx.login('lead');
    const guests = [];
    for (const n of ['g1', 'g2', 'g3', 'g4', 'g5']) guests.push(await ctx.login(n));
    await makeTeam(lead, []);
    for (const g of guests.slice(0, 4)) {
      await lead.agent.post('/api/teams/me/invitations').send({ email: g.email }).expect(202);
    }
    const full = await lead.agent
      .post('/api/teams/me/invitations')
      .send({ email: guests[4].email });
    expect(full.status).toBe(409);
    const pending = (await lead.agent.get('/api/teams/me').expect(200)).body.team.pending;
    await lead.agent.post(`/api/teams/me/invitations/${pending[0].id}/cancel`).expect(200);
    await lead.agent.post('/api/teams/me/invitations').send({ email: guests[4].email }).expect(202);
  });
});

describe('BR46 an admin adds students to any team', () => {
  it('BR46 the admin finds students without a team and adds one, even without an invitation', async () => {
    const admin = await adminLogin();
    const lead = await ctx.login('lead');
    const free = await ctx.login('free');
    const taken = await ctx.login('taken');
    await makeTeam(lead, [taken]);
    const list = await admin.agent.get('/api/admin/users?noTeam=1').expect(200);
    const ids = list.body.users.map((u) => u.id);
    expect(ids).toContain(free.student.id);
    expect(ids).not.toContain(lead.student.id);
    expect(ids).not.toContain(admin.student.id);
    const searched = await admin.agent.get('/api/admin/users?noTeam=1&q=free').expect(200);
    expect(searched.body.users.map((u) => u.id)).toEqual([free.student.id]);

    const [[team]] = await ctx.pool.query('SELECT team_id FROM teams');
    await admin.agent
      .post(`/api/admin/teams/${team.team_id}/members`)
      .send({ studentId: free.student.id })
      .expect(204);
    const mine = (await free.agent.get('/api/teams/me').expect(200)).body.team;
    expect(mine.size).toBe(3);
    const [[event]] = await ctx.pool.query(
      "SELECT actor_id FROM audit_events WHERE event_type = 'added_to_team'",
    );
    expect(event.actor_id).toBe(admin.student.id);
  });

  it('BR46 the admin is told why a student cannot be added', async () => {
    const admin = await adminLogin();
    const lead = await ctx.login('lead');
    const inTeam = await ctx.login('inteam');
    const blocked = await ctx.login('blocked');
    await makeTeam(lead, []);
    const [[team]] = await ctx.pool.query('SELECT team_id FROM teams');
    const add = (studentId) =>
      admin.agent.post(`/api/admin/teams/${team.team_id}/members`).send({ studentId });
    const other = await ctx.login('another');
    await makeTeam(other, [inTeam], 'Other Team');
    const taken = await add(inTeam.student.id);
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('ALREADY_IN_TEAM');
    await admin.agent
      .post(`/api/admin/users/${blocked.student.id}/status`)
      .send({ status: 'blocked' })
      .expect(200);
    expect((await add(blocked.student.id)).body.error.code).toBe('STUDENT_NOT_ACTIVE');
    expect((await add(admin.student.id)).body.error.code).toBe('NOT_A_STUDENT');
    expect((await add(999999)).body.error.code).toBe('STUDENT_NOT_FOUND');
    const guests = [];
    for (const n of ['f1', 'f2', 'f3', 'f4', 'f5']) guests.push(await ctx.login(n));
    for (const g of guests.slice(0, 4)) await add(g.student.id).expect(204);
    const full = await add(guests[4].student.id);
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('TEAM_FULL');
  });

  it('BR46 students cannot use the add-member endpoint', async () => {
    const lead = await ctx.login('lead');
    const free = await ctx.login('free');
    await makeTeam(lead, []);
    const [[team]] = await ctx.pool.query('SELECT team_id FROM teams');
    await lead.agent
      .post(`/api/admin/teams/${team.team_id}/members`)
      .send({ studentId: free.student.id })
      .expect(403);
  });
});
