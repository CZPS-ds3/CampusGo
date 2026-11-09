import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const adminLogin = () => ctx.login('sekretariat.dski', { firstName: 'Study', lastName: 'Office' });

async function otpLoginStatus(email) {
  const request = (await import('supertest')).default;
  const agent = request.agent(ctx.app);
  ctx.clock.advance(31_000);
  await agent.post('/api/auth/request-otp').send({ email }).expect(200);
  await ctx.mailer.idle();
  const otp = ctx.mailer.lastTo(email).text.match(/\b(\d{6})\b/)[1];
  return agent.post('/api/auth/verify').send({ email, otp, firstName: 'New', lastName: 'Start' });
}

const count = async (sql, params) => {
  const [[row]] = await ctx.pool.query(sql, params);
  return Number(row.n);
};

describe('BR47 deleting an account removes it for good', () => {
  it('BR47 an admin delete removes the account, its data and its sessions, and repairs the team', async () => {
    const admin = await adminLogin();
    const lead = await ctx.login('lead', { firstName: 'Lena', lastName: 'Lead' });
    const mate = await ctx.login('mate');
    await lead.agent.post('/api/teams').send({ name: 'Night Owls' }).expect(201);
    await lead.agent.post('/api/teams/me/invitations').send({ email: mate.email }).expect(202);
    const invitation = (await mate.agent.get('/api/invitations')).body.invitations[0];
    await mate.agent.post(`/api/invitations/${invitation.id}/accept`).expect(200);
    await ctx.startAttempt(lead.agent, 'Mensa');

    await admin.agent.delete(`/api/admin/users/${lead.student.id}`).expect(204);
    await lead.agent.get('/api/me').expect(401);
    await admin.agent.get(`/api/admin/users/${lead.student.id}`).expect(404);

    const id = [lead.student.id];
    expect(await count('SELECT COUNT(*) AS n FROM students WHERE student_id = ?', id)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM attempts WHERE student_id = ?', id)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM sessions WHERE student_id = ?', id)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM location_checks WHERE student_id = ?', id)).toBe(
      0,
    );
    expect(await count('SELECT COUNT(*) AS n FROM audit_events WHERE student_id = ?', id)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM team_invitations WHERE inviter_id = ?', id)).toBe(
      0,
    );

    // The team stays with the mate, who is now the leader.
    const team = (await mate.agent.get('/api/teams/me').expect(200)).body.team;
    expect(team.leaderId).toBe(mate.student.id);
    expect(team.size).toBe(1);

    // The address is free again: signing in with it starts a brand-new account.
    const fresh = await otpLoginStatus(lead.email);
    expect(fresh.status).toBe(201);
    expect(fresh.body.student.id).not.toBe(lead.student.id);
  });

  it('BR47 a deleted account is in no list, no filter, no count and no leaderboard', async () => {
    const admin = await adminLogin();
    const gone = await ctx.login('gone', { firstName: 'Greta', lastName: 'Gone' });
    await ctx.pool.query('UPDATE students SET total_points = 500 WHERE student_id = ?', [
      gone.student.id,
    ]);
    await admin.agent.delete(`/api/admin/users/${gone.student.id}`).expect(204);

    const all = (await admin.agent.get('/api/admin/users').expect(200)).body.users;
    expect(all.map((u) => u.id)).not.toContain(gone.student.id);
    const overview = (await admin.agent.get('/api/admin/overview').expect(200)).body;
    expect(overview.users).toEqual({ active: 0, blocked: 0, archived: 0 });
    // "deleted" is not a status any more.
    await admin.agent.get('/api/admin/users?status=deleted').expect(400);

    const viewer = await ctx.login('viewer');
    const board = (await viewer.agent.get('/api/leaderboards/solo').expect(200)).body.entries;
    expect(board.map((e) => e.id)).not.toContain(gone.student.id);
    await viewer.agent.get(`/api/players/${gone.student.id}`).expect(404);
  });

  it('BR47 there is no restore and no second "permanent" step any more', async () => {
    const admin = await adminLogin();
    const student = await ctx.login('nothing');
    await admin.agent.delete(`/api/admin/users/${student.student.id}`).expect(204);
    await admin.agent.post(`/api/admin/users/${student.student.id}/restore`).expect(404);
    await admin.agent.delete(`/api/admin/users/${student.student.id}/permanent`).expect(404);
    await admin.agent.delete(`/api/admin/users/${student.student.id}`).expect(404);
  });

  it('BR47 a student who deletes their own account is removed completely too', async () => {
    const admin = await adminLogin();
    const student = await ctx.login('leaver', { firstName: 'Lea', lastName: 'Ver' });
    await student.agent.delete('/api/me').expect(204);
    await admin.agent.get(`/api/admin/users/${student.student.id}`).expect(404);
    const list = await admin.agent.get('/api/admin/users').expect(200);
    expect(list.body.users.map((u) => u.id)).not.toContain(student.student.id);
  });

  it('BR47 the log keeps one neutral line: who deleted and when, with no name or address', async () => {
    const admin = await adminLogin();
    const student = await ctx.login('trace', { firstName: 'Tara', lastName: 'Trace' });
    await admin.agent.delete(`/api/admin/users/${student.student.id}`).expect(204);
    const [rows] = await ctx.pool.query(
      "SELECT student_id, actor_id, detail FROM audit_events WHERE event_type = 'account_deleted_by_admin'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ student_id: null, actor_id: admin.student.id, detail: null });
  });

  it('BR47 administrators cannot be deleted; they must be made students first', async () => {
    const admin = await adminLogin();
    await admin.agent.delete(`/api/admin/users/${admin.student.id}`).expect(403);
    const second = await ctx.login('second.admin');
    await admin.agent
      .post(`/api/admin/users/${second.student.id}/role`)
      .send({ role: 'admin' })
      .expect(200);
    await admin.agent.delete(`/api/admin/users/${second.student.id}`).expect(403);
    await admin.agent
      .post(`/api/admin/users/${second.student.id}/role`)
      .send({ role: 'student' })
      .expect(200);
    await admin.agent.delete(`/api/admin/users/${second.student.id}`).expect(204);
  });

  it('BR47 migration 011 removed the old "deleted" status and the erase markers', async () => {
    const [columns] = await ctx.pool.query(
      `SELECT column_name AS name, column_type AS type FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'students'`,
    );
    const byName = Object.fromEntries(columns.map((c) => [c.name, c.type]));
    expect(byName.status).toBe("enum('active','blocked','archived')");
    expect(byName).not.toHaveProperty('deleted_at');
    expect(byName).not.toHaveProperty('purged_at');
  });
});
