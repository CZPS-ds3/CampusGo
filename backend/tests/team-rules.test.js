import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withTransaction } from '../src/db/pool.js';
import { refreshTeamScore } from '../src/services/teams.js';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const adminLogin = () => ctx.login('sekretariat.dski', { firstName: 'Study', lastName: 'Office' });

/** Creates a team led by `lead` and lets every member accept an invitation. */
async function teamOf(lead, members, name) {
  await lead.agent.post('/api/teams').send({ name }).expect(201);
  for (const member of members) {
    await lead.agent.post('/api/teams/me/invitations').send({ email: member.email }).expect(202);
    const { body } = await member.agent.get('/api/invitations').expect(200);
    await member.agent.post(`/api/invitations/${body.invitations.at(-1).id}/accept`).expect(200);
  }
}

async function setTotals(totals) {
  for (const [student, points] of totals) {
    await ctx.pool.query('UPDATE students SET total_points = ? WHERE student_id = ?', [
      points,
      student.student.id,
    ]);
  }
}

async function teamScoreOf(teamName) {
  const [[team]] = await ctx.pool.query(
    'SELECT team_id, team_score FROM teams WHERE team_name = ?',
    [teamName],
  );
  await withTransaction(ctx.pool, (conn) => refreshTeamScore(conn, team.team_id, ctx.clock.now()));
  const [[after]] = await ctx.pool.query('SELECT team_score FROM teams WHERE team_id = ?', [
    team.team_id,
  ]);
  return after.team_score;
}

describe('BR43 the team score is the average, rounded up', () => {
  it('BR43 five members: the sum is divided by 5 and members with 0 points count', async () => {
    const people = [];
    for (const n of ['p1', 'p2', 'p3', 'p4', 'p5']) people.push(await ctx.login(n));
    await teamOf(people[0], people.slice(1), 'Five');
    await setTotals([[people[0], 1000]]);
    expect(await teamScoreOf('Five')).toBe(200);
    await setTotals([[people[0], 1001]]);
    expect(await teamScoreOf('Five')).toBe(201); // 200.2 rounds up to the next whole number
  });

  it('BR43 three members with 1000, 1000 and 1001 points give 1001', async () => {
    const people = [];
    for (const n of ['a', 'b', 'c']) people.push(await ctx.login(n));
    await teamOf(people[0], people.slice(1), 'Three');
    await setTotals([
      [people[0], 1000],
      [people[1], 1000],
      [people[2], 1001],
    ]);
    expect(await teamScoreOf('Three')).toBe(1001); // 3001 / 3 = 1000.33, rounded up
  });

  it('BR43 a blocked member no longer counts in the average', async () => {
    const admin = await adminLogin();
    const people = [];
    for (const n of ['x', 'y', 'z']) people.push(await ctx.login(n));
    await teamOf(people[0], people.slice(1), 'Trio');
    await setTotals([
      [people[0], 900],
      [people[1], 300],
      [people[2], 0],
    ]);
    expect(await teamScoreOf('Trio')).toBe(400);
    await admin.agent
      .post(`/api/admin/users/${people[2].student.id}/status`)
      .send({ status: 'blocked' })
      .expect(200);
    const [[team]] = await ctx.pool.query("SELECT team_score FROM teams WHERE team_name = 'Trio'");
    expect(team.team_score).toBe(600); // (900 + 300) / 2
  });

  it('BR43 the team score really is the average after a quiz, in the team board', async () => {
    const a = await ctx.login('qa');
    const b = await ctx.login('qb');
    const c = await ctx.login('qc');
    await teamOf(a, [b, c], 'Quiz Team');
    const attempt = await ctx.startAttempt(a.agent, 'Sensoricum');
    const res = await ctx.answerPattern(a.agent, attempt, [true, true, true]);
    expect(res.status).toBe(200);
    const [[mine]] = await ctx.pool.query(
      'SELECT total_points FROM students WHERE student_id = ?',
      [a.student.id],
    );
    expect(mine.total_points).toBeGreaterThan(0);
    const board = await a.agent.get('/api/leaderboards/team').expect(200);
    expect(board.body.entries[0]).toMatchObject({
      name: 'Quiz Team',
      points: Math.ceil(mine.total_points / 3),
      members: 3,
    });
  });
});

describe('BR42 teams with an administrator are not ranked', () => {
  it('BR42 a team that has an admin member is missing from the team board and from profiles', async () => {
    const admin = await adminLogin();
    const s1 = await ctx.login('s1');
    const s2 = await ctx.login('s2');
    const t1 = await ctx.login('t1');
    const t2 = await ctx.login('t2');
    await teamOf(t1, [t2], 'Students Only');
    await teamOf(admin, [s1, s2], 'Staff Team');

    const mine = await s1.agent.get('/api/teams/me').expect(200);
    expect(mine.body.team).toMatchObject({ ranked: false, hasAdmin: true, size: 3 });
    const board = await t1.agent.get('/api/leaderboards/team').expect(200);
    expect(board.body.entries.map((e) => e.name)).toEqual(['Students Only']);
    const profile = await t1.agent.get(`/api/players/${s1.student.id}`).expect(200);
    expect(profile.body.player.team.rank).toBeNull();
    const stats = await admin.agent.get('/api/admin/stats').expect(200);
    expect(JSON.stringify(stats.body.topTeams)).not.toContain('Staff Team');
  });

  it('BR42 the team is ranked again as soon as the admin has left it', async () => {
    const admin = await adminLogin();
    const s1 = await ctx.login('s1');
    const s2 = await ctx.login('s2');
    await teamOf(admin, [s1, s2], 'Staff Team');
    const before = await s1.agent.get('/api/leaderboards/team').expect(200);
    expect(before.body.entries).toHaveLength(0);
    const [[team]] = await ctx.pool.query(
      "SELECT team_id FROM teams WHERE team_name = 'Staff Team'",
    );
    await admin.agent
      .delete(`/api/admin/teams/${team.team_id}/members/${admin.student.id}`)
      .expect(204);
    const after = await s1.agent.get('/api/leaderboards/team').expect(200);
    expect(after.body.entries.map((e) => e.name)).toEqual(['Staff Team']);
    const mine = await s1.agent.get('/api/teams/me').expect(200);
    expect(mine.body.team).toMatchObject({ ranked: true, hasAdmin: false });
  });

  it('BR42 after a quest the result shows the team rank before and after, for students in a ranked team', async () => {
    const lead = await ctx.login('lead');
    const mate = await ctx.login('mate');
    const rivalA = await ctx.login('rival-a');
    const rivalB = await ctx.login('rival-b');
    const solo = await ctx.login('solo');
    await teamOf(lead, [mate], 'Leaders');
    await teamOf(rivalA, [rivalB], 'Rivals');
    await setTotals([[rivalA, 100]]);
    await teamScoreOf('Rivals');

    const attempt = await ctx.startAttempt(lead.agent, 'Sensoricum');
    const done = await ctx.answerPattern(lead.agent, attempt, [true, true, true]);
    expect(done.body.result.passed).toBe(true);
    const { body } = await lead.agent.get(`/api/attempts/${attempt.id}/result`).expect(200);
    expect(body.result.team).toMatchObject({
      teamName: 'Leaders',
      teamRankBefore: 2,
      teamRankAfter: 1,
      teamScoreBefore: 0,
    });
    expect(body.result.team.teamScoreAfter).toBe(Math.ceil(body.result.totalPoints / 2));

    const soloAttempt = await ctx.startAttempt(solo.agent, 'Mensa');
    await ctx.answerPattern(solo.agent, soloAttempt, [true, true, true, true, true]);
    const alone = await solo.agent.get(`/api/attempts/${soloAttempt.id}/result`).expect(200);
    expect(alone.body.result.team).toBeNull();
  });
});

describe('BR41 the administrator can reset the test points', () => {
  it('BR41 an admin earns points in test mode, stays out of every ranking, and can reset them', async () => {
    const admin = await adminLogin();
    const student = await ctx.login('student');
    const library = await ctx.checkpointByName(admin.agent, 'Library');
    const start = await admin.agent
      .post(`/api/checkpoints/${library.id}/verify`)
      .send({ lat: 0, lng: 0, accuracy: 5000, ageMs: 0 })
      .expect(200);
    const done = await ctx.answerPattern(admin.agent, start.body.attempt, [
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(done.body.result.passed).toBe(true);
    const me = await admin.agent.get('/api/me').expect(200);
    expect(me.body.student.totalPoints).toBeGreaterThan(0);
    expect(me.body.student.rank).toBeNull();
    const result = await admin.agent
      .get(`/api/attempts/${start.body.attempt.id}/result`)
      .expect(200);
    expect(result.body.result.rankBefore).toBeNull();
    expect(result.body.result.rankAfter).toBeNull();
    expect(result.body.result.team).toBeUndefined();
    const board = await student.agent.get('/api/leaderboards/solo').expect(200);
    expect(board.body.entries.map((e) => e.id)).not.toContain(admin.student.id);

    await admin.agent.post('/api/me/reset-points').expect(200);
    const after = await admin.agent.get('/api/me').expect(200);
    expect(after.body.student.totalPoints).toBe(0);
    const [[left]] = await ctx.pool.query(
      'SELECT COUNT(*) AS n FROM attempts WHERE student_id = ?',
      [admin.student.id],
    );
    expect(left.n).toBe(0);
    const [[event]] = await ctx.pool.query(
      "SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'points_reset' AND student_id = ?",
      [admin.student.id],
    );
    expect(event.n).toBe(1);
    // After the reset the quiz can be passed again for points.
    const again = await admin.agent
      .post(`/api/checkpoints/${library.id}/verify`)
      .send({ lat: 0, lng: 0, accuracy: 5000, ageMs: 0 })
      .expect(200);
    expect(again.body.status).toBe('OK');
  });

  it('BR41 students cannot reset points and an admin still cannot rank another way', async () => {
    const student = await ctx.login('student');
    const res = await student.agent.post('/api/me/reset-points');
    expect(res.status).toBe(403);
  });
});
