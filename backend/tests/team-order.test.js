import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const adminLogin = () => ctx.login('sekretariat.dski', { firstName: 'Study', lastName: 'Office' });

/** `lead` creates the team, then every mate accepts an invitation one second after the other. */
async function makeTeam(lead, mates, name = 'Night Owls') {
  await lead.agent.post('/api/teams').send({ name }).expect(201);
  for (const mate of mates) {
    ctx.clock.advance(1000);
    await lead.agent.post('/api/teams/me/invitations').send({ email: mate.email }).expect(202);
    const { body } = await mate.agent.get('/api/invitations').expect(200);
    await mate.agent.post(`/api/invitations/${body.invitations.at(-1).id}/accept`).expect(200);
  }
  return (await lead.agent.get('/api/teams/me').expect(200)).body.team;
}

const myTeam = async (who) => (await who.agent.get('/api/teams/me').expect(200)).body.team;

describe('BR54 leaving a team', () => {
  it('BR54 a member leaves: the team keeps its leader and closes the gap in the order', async () => {
    const lead = await ctx.login('lead');
    const a = await ctx.login('amy');
    const b = await ctx.login('ben');
    await makeTeam(lead, [a, b]);
    await a.agent.post('/api/teams/me/leave').expect(200);
    expect(await myTeam(a)).toBeNull();
    const team = await myTeam(lead);
    expect(team.leaderId).toBe(lead.student.id);
    expect(team.members.map((m) => [m.id, m.position])).toEqual([
      [lead.student.id, 1],
      [b.student.id, 2],
    ]);
    const [[event]] = await ctx.pool.query(
      "SELECT student_id, actor_id FROM audit_events WHERE event_type = 'left_team'",
    );
    expect(event).toMatchObject({ student_id: a.student.id, actor_id: a.student.id });
  });

  it('BR44 BR54 when the leader leaves, the next earliest member becomes the leader with leader rights', async () => {
    const lead = await ctx.login('lead');
    const a = await ctx.login('amy');
    const b = await ctx.login('ben');
    await makeTeam(lead, [a, b]);
    await lead.agent.post('/api/teams/me/leave').expect(200);
    const team = await myTeam(a);
    expect(team.leaderId).toBe(a.student.id);
    // The new leader really has the leader rights: removing a member works for amy, not for ben.
    const refused = await b.agent.delete(`/api/teams/me/members/${a.student.id}`);
    expect(refused.body.error.code).toBe('NOT_LEADER');
    await a.agent.delete(`/api/teams/me/members/${b.student.id}`).expect(200);
    const [[event]] = await ctx.pool.query(
      "SELECT student_id FROM audit_events WHERE event_type = 'team_leader_changed'",
    );
    expect(event.student_id).toBe(a.student.id);
  });

  it('BR54 the last member leaving deletes the team and its open invitations', async () => {
    const lead = await ctx.login('lead');
    const guest = await ctx.login('guest');
    await lead.agent.post('/api/teams').send({ name: 'Solo Crew' }).expect(201);
    await lead.agent.post('/api/teams/me/invitations').send({ email: guest.email }).expect(202);
    await lead.agent.post('/api/teams/me/leave').expect(200);
    const [teams] = await ctx.pool.query("SELECT team_id FROM teams WHERE team_name = 'Solo Crew'");
    expect(teams).toHaveLength(0);
    expect((await guest.agent.get('/api/invitations').expect(200)).body.invitations).toEqual([]);
    // The name is free again.
    await guest.agent.post('/api/teams').send({ name: 'Solo Crew' }).expect(201);
  });

  it('BR54 leaving without a team is refused with NO_TEAM', async () => {
    const loner = await ctx.login('loner');
    const res = await loner.agent.post('/api/teams/me/leave');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_TEAM');
  });

  it('BR43 BR54 the team score is recalculated after someone leaves', async () => {
    const lead = await ctx.login('lead');
    const a = await ctx.login('amy');
    await makeTeam(lead, [a]);
    const attempt = await ctx.startAttempt(a.agent, 'Sensoricum');
    await ctx.answerPattern(a.agent, attempt, [true, true, true]);
    expect((await myTeam(lead)).score).toBeGreaterThan(0);
    await a.agent.post('/api/teams/me/leave').expect(200);
    expect((await myTeam(lead)).score).toBe(0);
  });

  it('BR54 someone who left can join another team at once', async () => {
    const lead = await ctx.login('lead');
    const a = await ctx.login('amy');
    const other = await ctx.login('other');
    await makeTeam(lead, [a]);
    await a.agent.post('/api/teams/me/leave').expect(200);
    await makeTeam(other, [a], 'Second Team');
    expect((await myTeam(a)).name).toBe('Second Team');
    expect((await myTeam(a)).members.at(-1)).toMatchObject({ id: a.student.id, position: 2 });
  });
});

describe('BR54 the admin chooses the leader and the order of a team', () => {
  it('BR54 an admin makes any active member the leader', async () => {
    const admin = await adminLogin();
    const lead = await ctx.login('lead');
    const a = await ctx.login('amy');
    const team = await makeTeam(lead, [a]);
    await admin.agent
      .put(`/api/admin/teams/${team.id}/leader`)
      .send({ studentId: a.student.id })
      .expect(204);
    expect((await myTeam(lead)).leaderId).toBe(a.student.id);
    const { body } = await admin.agent.get('/api/admin/teams').expect(200);
    expect(body.teams.find((x) => x.id === team.id).leaderId).toBe(a.student.id);
  });

  it('BR54 a person outside the team or a blocked member cannot be made the leader', async () => {
    const admin = await adminLogin();
    const lead = await ctx.login('lead');
    const a = await ctx.login('amy');
    const outsider = await ctx.login('outsider');
    const team = await makeTeam(lead, [a]);
    const outside = await admin.agent
      .put(`/api/admin/teams/${team.id}/leader`)
      .send({ studentId: outsider.student.id });
    expect(outside.body.error.code).toBe('NOT_A_MEMBER');
    await admin.agent
      .post(`/api/admin/users/${a.student.id}/status`)
      .send({ status: 'blocked', reason: 'test' })
      .expect(200);
    const blocked = await admin.agent
      .put(`/api/admin/teams/${team.id}/leader`)
      .send({ studentId: a.student.id });
    expect(blocked.body.error.code).toBe('STUDENT_NOT_ACTIVE');
    const unknown = await admin.agent
      .put('/api/admin/teams/999999/leader')
      .send({ studentId: a.student.id });
    expect(unknown.status).toBe(404);
  });

  it('BR54 an admin changes the order and the leader hand-over follows the new order', async () => {
    const admin = await adminLogin();
    const lead = await ctx.login('lead');
    const a = await ctx.login('amy');
    const b = await ctx.login('ben');
    const team = await makeTeam(lead, [a, b]);
    await admin.agent
      .put(`/api/admin/teams/${team.id}/order`)
      .send({ studentIds: [b.student.id, lead.student.id, a.student.id] })
      .expect(204);
    const listed = (await admin.agent.get('/api/admin/teams').expect(200)).body.teams.find(
      (x) => x.id === team.id,
    );
    expect(listed.members.map((m) => [m.id, m.position])).toEqual([
      [b.student.id, 1],
      [lead.student.id, 2],
      [a.student.id, 3],
    ]);
    // The leader stays the leader until they leave; then the first in the new order (ben) takes over.
    expect((await myTeam(lead)).leaderId).toBe(lead.student.id);
    await lead.agent.post('/api/teams/me/leave').expect(200);
    expect((await myTeam(a)).leaderId).toBe(b.student.id);
  });

  it('BR54 the new order must list every member exactly once', async () => {
    const admin = await adminLogin();
    const lead = await ctx.login('lead');
    const a = await ctx.login('amy');
    const outsider = await ctx.login('outsider');
    const team = await makeTeam(lead, [a]);
    for (const studentIds of [
      [lead.student.id],
      [lead.student.id, lead.student.id],
      [lead.student.id, outsider.student.id],
      [lead.student.id, a.student.id, outsider.student.id],
    ]) {
      const res = await admin.agent.put(`/api/admin/teams/${team.id}/order`).send({ studentIds });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ORDER_MISMATCH');
    }
  });

  it('BR44 BR54 an admin removing the leader hands the team to the next member in the order', async () => {
    const admin = await adminLogin();
    const lead = await ctx.login('lead');
    const a = await ctx.login('amy');
    const b = await ctx.login('ben');
    const team = await makeTeam(lead, [a, b]);
    await admin.agent
      .put(`/api/admin/teams/${team.id}/order`)
      .send({ studentIds: [lead.student.id, b.student.id, a.student.id] })
      .expect(204);
    await admin.agent.delete(`/api/admin/teams/${team.id}/members/${lead.student.id}`).expect(204);
    const after = await myTeam(a);
    expect(after.leaderId).toBe(b.student.id);
    expect(after.members.map((m) => [m.id, m.position])).toEqual([
      [b.student.id, 1],
      [a.student.id, 2],
    ]);
  });

  it('BR46 BR54 a student the admin adds goes to the end of the team order', async () => {
    const admin = await adminLogin();
    const lead = await ctx.login('lead');
    const a = await ctx.login('amy');
    const team = await makeTeam(lead, [a]);
    const late = await ctx.login('late');
    await admin.agent
      .post(`/api/admin/teams/${team.id}/members`)
      .send({ studentId: late.student.id })
      .expect(204);
    expect((await myTeam(lead)).members.at(-1)).toMatchObject({ id: late.student.id, position: 3 });
  });

  it('BR54 students cannot change the leader or the order', async () => {
    const lead = await ctx.login('lead');
    const a = await ctx.login('amy');
    const team = await makeTeam(lead, [a]);
    const leader = await lead.agent
      .put(`/api/admin/teams/${team.id}/leader`)
      .send({ studentId: a.student.id });
    expect(leader.status).toBe(403);
    const order = await lead.agent
      .put(`/api/admin/teams/${team.id}/order`)
      .send({ studentIds: [a.student.id, lead.student.id] });
    expect(order.status).toBe(403);
  });

  it('BR05 a team name needs 3 to 30 characters', async () => {
    const lead = await ctx.login('lead');
    const short = await lead.agent.post('/api/teams').send({ name: 'AB' });
    expect(short.status).toBe(400);
    await lead.agent.post('/api/teams').send({ name: 'ABC' }).expect(201);
  });
});
