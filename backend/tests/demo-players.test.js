// BR56: the invented players of the demo seed are hidden from rankings, profiles, statistics and the admin lists
// until an administrator shows them for testing (the switch next to the code preview).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const adminLogin = () => ctx.login('sekretariat.dski', { firstName: 'Study', lastName: 'Office' });

/** A team of two whose leader is `lead`. */
async function teamOf(lead, mate, name) {
  await lead.agent.post('/api/teams').send({ name }).expect(201);
  await lead.agent.post('/api/teams/me/invitations').send({ email: mate.email }).expect(202);
  const { body } = await mate.agent.get('/api/invitations').expect(200);
  await mate.agent.post(`/api/invitations/${body.invitations.at(-1).id}/accept`).expect(200);
}

/**
 * Two real players in "Real Team" with a few points and two invented demo players in "Demo Dragons", far ahead of
 * them, as the demo seed would make them.
 */
async function world() {
  const real = await ctx.login('real.one', { firstName: 'Real', lastName: 'One' });
  const mate = await ctx.login('real.two', { firstName: 'Real', lastName: 'Two' });
  const demoA = await ctx.login('demo.a', { firstName: 'Demo', lastName: 'Alpha' });
  const demoB = await ctx.login('demo.b', { firstName: 'Demo', lastName: 'Beta' });
  await teamOf(real, mate, 'Real Team');
  await teamOf(demoA, demoB, 'Demo Dragons');
  await ctx.pool.query('UPDATE students SET total_points = 100 WHERE email IN (?)', [
    [real.email, mate.email],
  ]);
  await ctx.pool.query(
    'UPDATE students SET is_demo = TRUE, total_points = 9000 WHERE email IN (?)',
    [[demoA.email, demoB.email]],
  );
  await ctx.pool.query("UPDATE teams SET team_score = 100 WHERE team_name = 'Real Team'");
  await ctx.pool.query("UPDATE teams SET team_score = 9000 WHERE team_name = 'Demo Dragons'");
  return { real, demoA };
}

async function showDemo(on) {
  const admin = await adminLogin();
  const { body } = await admin.agent.put('/api/admin/settings').send({ showDemo: on }).expect(200);
  expect(body.settings.showDemo).toBe(on);
  return admin;
}

const names = (entries) => entries.map((e) => e.displayName ?? e.name);

describe('BR56 demo players are hidden until an admin shows them', () => {
  it('BR56 by default the demo players are in no ranking, count for no rank and have no profile', async () => {
    const { real, demoA } = await world();
    const solo = (await real.agent.get('/api/leaderboards/solo').expect(200)).body;
    expect(names(solo.entries).join()).not.toMatch(/Demo/);
    expect(solo.you.rank).toBe(1);
    expect((await real.agent.get('/api/me').expect(200)).body.student.rank).toBe(1);
    await real.agent.get(`/api/players/${demoA.student.id}`).expect(404);
    const team = (await real.agent.get('/api/leaderboards/team').expect(200)).body;
    expect(names(team.entries)).toEqual(['Real Team']);
    expect(team.yourTeam.rank).toBe(1);
  });

  it('BR56 an admin shows them for testing, and the rankings and profiles include them again', async () => {
    const { real, demoA } = await world();
    const admin = await showDemo(true);
    const solo = (await real.agent.get('/api/leaderboards/solo').expect(200)).body;
    expect(names(solo.entries).filter((n) => n.startsWith('Demo'))).toHaveLength(2);
    expect(solo.you.rank).toBe(3);
    await real.agent.get(`/api/players/${demoA.student.id}`).expect(200);
    const team = (await real.agent.get('/api/leaderboards/team').expect(200)).body;
    expect(names(team.entries)).toEqual(['Demo Dragons', 'Real Team']);
    // Hidden again: gone again.
    await admin.agent.put('/api/admin/settings').send({ showDemo: false }).expect(200);
    expect((await real.agent.get('/api/me').expect(200)).body.student.rank).toBe(1);
  });

  it('BR56 the admin lists and the dashboard leave hidden demo players out', async () => {
    await world();
    const admin = await adminLogin();
    const users = async () =>
      (await admin.agent.get('/api/admin/users').expect(200)).body.users.map((u) => u.email);
    const teams = async () =>
      (await admin.agent.get('/api/admin/teams').expect(200)).body.teams.map((t) => t.name);
    const top = async () =>
      (await admin.agent.get('/api/admin/stats').expect(200)).body.topPlayers.map(
        (p) => p.displayName,
      );
    expect((await users()).join()).not.toMatch(/demo\./);
    expect(await teams()).toEqual(['Real Team']);
    expect((await top()).join()).not.toMatch(/Demo/);

    await admin.agent.put('/api/admin/settings').send({ showDemo: true }).expect(200);
    expect((await users()).filter((e) => e.startsWith('demo.'))).toHaveLength(2);
    expect(await teams()).toContain('Demo Dragons');
    expect((await top()).filter((n) => n.startsWith('Demo'))).toHaveLength(2);
  });

  it('BR56 the switch is off by default, takes only true or false, and only admins may use it', async () => {
    const admin = await adminLogin();
    expect((await admin.agent.get('/api/admin/settings').expect(200)).body.settings.showDemo).toBe(
      false,
    );
    await admin.agent.put('/api/admin/settings').send({}).expect(400);
    await admin.agent.put('/api/admin/settings').send({ showDemo: 'yes' }).expect(400);
    // Changing one setting leaves the other as it was.
    const { body } = await admin.agent
      .put('/api/admin/settings')
      .send({ showDemo: true })
      .expect(200);
    expect(body.settings).toMatchObject({ showDemo: true, otpPreview: false });
    const student = await ctx.login('not.an.admin');
    await student.agent.put('/api/admin/settings').send({ showDemo: true }).expect(403);
  });
});
