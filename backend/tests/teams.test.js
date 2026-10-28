import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DOMAIN, createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const HOUR = 3600 * 1000;

/** Creates a team led by `leader` and returns the pending invitation ids of the given members. */
async function teamWithInvites(leader, members, teamName = 'Night Owls') {
  await leader.agent.post('/api/teams').send({ name: teamName }).expect(201);
  const ids = [];
  for (const member of members) {
    await leader.agent.post('/api/teams/me/invitations').send({ email: member.email }).expect(202);
    const { body } = await member.agent.get('/api/invitations').expect(200);
    ids.push(body.invitations.at(-1).id);
  }
  return ids;
}

async function earnPoints(who, checkpointName = 'Sensoricum', pattern = [true, true, true]) {
  const attempt = await ctx.startAttempt(who.agent, checkpointName);
  await ctx.answerPattern(who.agent, attempt, pattern);
}

describe('BR05 teams and invitations', () => {
  it('BR05 creating a team makes the creator its first member and one team per user', async () => {
    const lead = await ctx.login('lead');
    const { body } = await lead.agent.post('/api/teams').send({ name: 'Night Owls' }).expect(201);
    expect(body.team).toMatchObject({ name: 'Night Owls', size: 1, active: false });
    const again = await lead.agent.post('/api/teams').send({ name: 'Other' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_IN_TEAM');
  });

  it('BR05 a team name is unique', async () => {
    const a = await ctx.login('a');
    const b = await ctx.login('b');
    await a.agent.post('/api/teams').send({ name: 'Same' }).expect(201);
    const res = await b.agent.post('/api/teams').send({ name: 'Same' });
    expect(res.body.error.code).toBe('TEAM_NAME_TAKEN');
  });

  it('BR05 an invitation can be accepted and the team becomes active with two members', async () => {
    const lead = await ctx.login('lead');
    const guest = await ctx.login('guest');
    const [id] = await teamWithInvites(lead, [guest]);
    const { body } = await guest.agent.post(`/api/invitations/${id}/accept`).expect(200);
    expect(body.team).toMatchObject({ size: 2, active: true });
  });

  it('BR05 a rejected invitation can not be accepted afterwards', async () => {
    const lead = await ctx.login('lead');
    const guest = await ctx.login('guest');
    const [id] = await teamWithInvites(lead, [guest]);
    await guest.agent.post(`/api/invitations/${id}/reject`).expect(204);
    const res = await guest.agent.post(`/api/invitations/${id}/accept`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVITATION_INVALID');
  });

  it('check 17 BR05: an invitation accepted at exactly created_at + 24 h is refused and becomes expired', async () => {
    const lead = await ctx.login('lead');
    const guest = await ctx.login('guest');
    const [id] = await teamWithInvites(lead, [guest]);
    const [[row]] = await ctx.pool.query(
      'SELECT expires_at FROM team_invitations WHERE invitation_id = ?',
      [id],
    );
    ctx.clock.set(row.expires_at.getTime() - 1);
    await ctx.pool.query("UPDATE sessions SET expires_at = '2100-01-01'"); // keep the sessions alive across the 24 h
    const early = await guest.agent.get('/api/invitations').expect(200);
    expect(early.body.invitations).toHaveLength(1);
    ctx.clock.set(row.expires_at.getTime());
    const res = await guest.agent.post(`/api/invitations/${id}/accept`);
    expect(res.status).toBe(409);
    const [[after]] = await ctx.pool.query(
      'SELECT status FROM team_invitations WHERE invitation_id = ?',
      [id],
    );
    expect(after.status).toBe('expired');
    expect(ctx.clock.now() - row.expires_at.getTime() + 24 * HOUR).toBeGreaterThan(0);
  });

  it('R-43 the invite answer is identical for known, unknown, already-teamed and own addresses', async () => {
    const lead = await ctx.login('lead');
    const other = await ctx.login('other');
    await lead.agent.post('/api/teams').send({ name: 'Night Owls' }).expect(201);
    const answers = [];
    for (const email of [other.email, `ghost@${DOMAIN}`, lead.email]) {
      const res = await lead.agent.post('/api/teams/me/invitations').send({ email });
      answers.push(`${res.status} ${res.text}`);
    }
    expect(new Set(answers).size).toBe(1);
  });

  it('BR05 a team with 5 members cannot send another invitation', async () => {
    const lead = await ctx.login('lead');
    const members = [];
    for (const name of ['m1', 'm2', 'm3', 'm4', 'extra']) members.push(await ctx.login(name));
    const ids = await teamWithInvites(lead, members.slice(0, 4));
    for (let i = 0; i < 4; i += 1)
      await members[i].agent.post(`/api/invitations/${ids[i]}/accept`).expect(200);
    const res = await lead.agent
      .post('/api/teams/me/invitations')
      .send({ email: members[4].email });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEAM_FULL');
    const { body } = await members[4].agent.get('/api/invitations').expect(200);
    expect(body.invitations).toHaveLength(0);
  });

  it('BR05 members plus open invitations may not pass 5, so no invitation is sent', async () => {
    const lead = await ctx.login('lead');
    const guests = [];
    for (const name of ['g1', 'g2', 'g3', 'g4', 'g5']) guests.push(await ctx.login(name));
    await teamWithInvites(lead, guests.slice(0, 4));
    const res = await lead.agent.post('/api/teams/me/invitations').send({ email: guests[4].email });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEAM_FULL');
    const { body } = await guests[4].agent.get('/api/invitations').expect(200);
    expect(body.invitations).toHaveLength(0);
  });

  it('BR05 an invitation is only created when the account exists (the reply stays generic)', async () => {
    const lead = await ctx.login('lead');
    await lead.agent.post('/api/teams').send({ name: 'Night Owls' }).expect(201);
    const res = await lead.agent
      .post('/api/teams/me/invitations')
      .send({ email: `nobody@${DOMAIN}` })
      .expect(202);
    expect(res.body.message).toMatch(/If the user exists/);
    const [rows] = await ctx.pool.query('SELECT invitation_id FROM team_invitations');
    expect(rows).toHaveLength(0);
  });

  it('BR05 blocked accounts cannot be invited', async () => {
    const lead = await ctx.login('lead');
    const guest = await ctx.login('guest');
    await ctx.pool.query("UPDATE students SET status = 'blocked' WHERE student_id = ?", [
      guest.student.id,
    ]);
    await lead.agent.post('/api/teams').send({ name: 'Night Owls' }).expect(201);
    await lead.agent.post('/api/teams/me/invitations').send({ email: guest.email }).expect(202);
    const [rows] = await ctx.pool.query('SELECT invitation_id FROM team_invitations');
    expect(rows).toHaveLength(0);
  });

  it('R-43 an invitation to an address outside the school domain is invalid input', async () => {
    const lead = await ctx.login('lead');
    await lead.agent.post('/api/teams').send({ name: 'Night Owls' }).expect(201);
    const res = await lead.agent.post('/api/teams/me/invitations').send({ email: 'x@gmail.com' });
    expect(res.status).toBe(400);
  });

  it('check 16 BR05: two invitees accepting the last free place at the same time give a team of exactly 5', async () => {
    const lead = await ctx.login('lead');
    const members = [];
    for (const name of ['m1', 'm2', 'm3', 'm4', 'late1', 'late2'])
      members.push(await ctx.login(name));
    // The API never lets members plus open invitations pass 5, so two surplus invitations are
    // written directly to reproduce what an older version could have left behind.
    const ids = await teamWithInvites(lead, members.slice(0, 4));
    const [[{ team_id: teamId }]] = await ctx.pool.query('SELECT team_id FROM teams');
    for (const late of members.slice(4)) {
      await ctx.pool.query(
        "INSERT INTO team_invitations (team_id, inviter_id, invitee_id, status, created_at, expires_at) VALUES (?, ?, ?, 'pending', ?, ?)",
        [
          teamId,
          lead.student.id,
          late.student.id,
          new Date(ctx.clock.now()),
          new Date(ctx.clock.now() + HOUR),
        ],
      );
      const { body } = await late.agent.get('/api/invitations').expect(200);
      ids.push(body.invitations.at(-1).id);
    }
    for (let i = 0; i < 3; i += 1)
      await members[i].agent.post(`/api/invitations/${ids[i]}/accept`).expect(200);
    const [a, b] = await Promise.all([
      members[3].agent.post(`/api/invitations/${ids[3]}/accept`),
      members[4].agent.post(`/api/invitations/${ids[4]}/accept`),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const [[{ size }]] = await ctx.pool.query(
      'SELECT COUNT(*) AS size FROM students WHERE team_id IS NOT NULL',
    );
    expect(size).toBe(5);
    const [pending] = await ctx.pool.query(
      "SELECT invitation_id FROM team_invitations WHERE status = 'pending'",
    );
    expect(pending).toHaveLength(0);
    const late = await members[5].agent.post(`/api/invitations/${ids[5]}/accept`);
    expect(late.status).toBe(409);
  });

  it("check 18 R-44: creating a team makes the user's other pending invitations invalid", async () => {
    const lead = await ctx.login('lead');
    const guest = await ctx.login('guest');
    const [id] = await teamWithInvites(lead, [guest]);
    await guest.agent.post('/api/teams').send({ name: 'Own Team' }).expect(201);
    const res = await guest.agent.post(`/api/invitations/${id}/accept`);
    expect(res.status).toBe(409);
    const [[row]] = await ctx.pool.query(
      'SELECT status FROM team_invitations WHERE invitation_id = ?',
      [id],
    );
    expect(row.status).toBe('invalid');
  });

  it('R-44 accepting one invitation invalidates the others of the same person', async () => {
    const lead1 = await ctx.login('lead1');
    const lead2 = await ctx.login('lead2');
    const guest = await ctx.login('guest');
    const [first] = await teamWithInvites(lead1, [guest], 'Team One');
    const [second] = await teamWithInvites(lead2, [guest], 'Team Two');
    await guest.agent.post(`/api/invitations/${first}/accept`).expect(200);
    const res = await guest.agent.post(`/api/invitations/${second}/accept`);
    expect(res.status).toBe(409);
  });

  it('BR05 a member can not read or answer an invitation that belongs to someone else', async () => {
    const lead = await ctx.login('lead');
    const guest = await ctx.login('guest');
    const spy = await ctx.login('spy');
    const [id] = await teamWithInvites(lead, [guest]);
    await spy.agent.post(`/api/invitations/${id}/accept`).expect(404);
  });
});

describe('BR04 BR06 BR24 team leaderboard', () => {
  it('check 19 BR06: a user without a team gets 403 on the team leaderboard', async () => {
    const solo = await ctx.login('solo');
    const res = await solo.agent.get('/api/leaderboards/team');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NO_TEAM');
  });

  it('check 19 BR06: a team of one may view the board but is not listed', async () => {
    const lead = await ctx.login('lead');
    await lead.agent.post('/api/teams').send({ name: 'Solo Team' }).expect(201);
    const { body } = await lead.agent.get('/api/leaderboards/team').expect(200);
    expect(body.entries).toEqual([]);
    expect(body.yourTeam).toBeNull();
  });

  it('BR04 example 12: the team score is the rounded-up average of member totals, members with 0 count', async () => {
    const lead = await ctx.login('lead');
    const m1 = await ctx.login('m1');
    const m2 = await ctx.login('m2');
    const ids = await teamWithInvites(lead, [m1, m2]);
    await earnPoints(lead);
    await earnPoints(m1, 'Sensoricum', [true, true, false]);
    await m1.agent.post(`/api/invitations/${ids[0]}/accept`).expect(200);
    await m2.agent.post(`/api/invitations/${ids[1]}/accept`).expect(200);
    const mine = await lead.agent.get('/api/teams/me').expect(200);
    const sum = mine.body.team.members.reduce((n, m) => n + m.totalPoints, 0);
    expect(mine.body.team.score).toBe(Math.ceil(sum / 3));
    expect(mine.body.team.members.some((m) => m.totalPoints === 0)).toBe(true);
    const board = await lead.agent.get('/api/leaderboards/team').expect(200);
    expect(board.body.entries[0]).toMatchObject({
      rank: 1,
      points: mine.body.team.score,
      members: 3,
      isYourTeam: true,
    });
  });

  it('BR04 a team score follows later points of its members', async () => {
    const lead = await ctx.login('lead');
    const guest = await ctx.login('guest');
    const [id] = await teamWithInvites(lead, [guest]);
    await guest.agent.post(`/api/invitations/${id}/accept`).expect(200);
    const before = await lead.agent.get('/api/teams/me').expect(200);
    expect(before.body.team.score).toBe(0);
    await earnPoints(lead);
    const after = await lead.agent.get('/api/teams/me').expect(200);
    const own = after.body.team.members.reduce((n, m) => n + m.totalPoints, 0);
    expect(after.body.team.score).toBe(Math.ceil(own / 2));
    expect(after.body.team.score).toBeGreaterThan(0);
  });

  it('BR24 check 20: teams with equal scores share a rank and the one that reached it earlier is first', async () => {
    const teams = [];
    for (const name of ['red', 'blue']) {
      const lead = await ctx.login(`${name}lead`);
      const guest = await ctx.login(`${name}guest`);
      const [id] = await teamWithInvites(lead, [guest], `Team ${name}`);
      await guest.agent.post(`/api/invitations/${id}/accept`).expect(200);
      teams.push(lead);
    }
    for (const lead of teams) {
      await earnPoints(lead);
      ctx.clock.advance(10_000);
    }
    const { body } = await teams[0].agent.get('/api/leaderboards/team').expect(200);
    expect(body.entries.map((e) => e.rank)).toEqual([1, 1]);
    expect(body.entries.map((e) => e.name)).toEqual(['Team red', 'Team blue']);
  });

  it('BR06 other users only see display names, never e-mail addresses or last names', async () => {
    const lead = await ctx.login('lead', { firstName: 'Anna', lastName: 'Schmidt' });
    const guest = await ctx.login('guest', { firstName: 'Ben', lastName: 'Meyer' });
    const [id] = await teamWithInvites(lead, [guest]);
    await guest.agent.post(`/api/invitations/${id}/accept`).expect(200);
    const board = await guest.agent.get('/api/leaderboards/solo').expect(200);
    const team = await guest.agent.get('/api/teams/me').expect(200);
    const shown = JSON.stringify([board.body, team.body]);
    expect(shown).not.toContain('Schmidt');
    expect(shown).not.toContain(`lead@${DOMAIN}`);
    expect(shown).toContain('Anna S.');
  });
});

describe('pending invitations on the team card', () => {
  it('BR06 pending invitations show only an expiry, never the invitee address', async () => {
    const lead = await ctx.login('lead');
    const guest = await ctx.login('guest');
    await lead.agent.post('/api/teams').send({ name: 'Night Owls' }).expect(201);
    await lead.agent.post('/api/teams/me/invitations').send({ email: guest.email }).expect(202);
    const { body } = await lead.agent.get('/api/teams/me').expect(200);
    expect(body.team.pending).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain('guest@');
    expect(Date.parse(body.team.pending[0].expiresAt)).toBeGreaterThan(ctx.clock.now());
  });
});
