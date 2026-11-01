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

describe('BR47 deleting and restoring accounts', () => {
  it('BR47 an admin delete keeps the data, ends the session and can be restored', async () => {
    const admin = await adminLogin();
    const lead = await ctx.login('lead', { firstName: 'Lena', lastName: 'Lead' });
    const mate = await ctx.login('mate');
    await lead.agent.post('/api/teams').send({ name: 'Night Owls' }).expect(201);
    await lead.agent.post('/api/teams/me/invitations').send({ email: mate.email }).expect(202);
    const invitation = (await mate.agent.get('/api/invitations')).body.invitations[0];
    await mate.agent.post(`/api/invitations/${invitation.id}/accept`).expect(200);

    await admin.agent.delete(`/api/admin/users/${lead.student.id}`).expect(204);
    await lead.agent.get('/api/me').expect(401);
    const detail = (await admin.agent.get(`/api/admin/users/${lead.student.id}`).expect(200)).body;
    expect(detail.user).toMatchObject({
      status: 'deleted',
      erased: false,
      email: lead.email,
      firstName: 'Lena',
      teamId: null,
    });
    expect(detail.user.deletedAt).toBeTruthy();
    // The team stays with the mate, who is now the leader.
    const team = (await mate.agent.get('/api/teams/me').expect(200)).body.team;
    expect(team.leaderId).toBe(mate.student.id);
    expect(team.size).toBe(1);
    // The address stays reserved and the deleted person cannot log in.
    const blocked = await otpLoginStatus(lead.email);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('ACCOUNT_UNAVAILABLE');

    const restored = await admin.agent
      .post(`/api/admin/users/${lead.student.id}/restore`)
      .expect(200);
    expect(restored.body.user).toMatchObject({
      status: 'active',
      erased: false,
      firstName: 'Lena',
    });
    const back = await otpLoginStatus(lead.email);
    expect(back.status).toBe(200);
    expect(back.body.student.id).toBe(lead.student.id);
    const types = (await admin.agent.get(`/api/admin/users/${lead.student.id}`)).body.events.map(
      (e) => e.type,
    );
    expect(types).toEqual(expect.arrayContaining(['account_deleted_by_admin', 'account_restored']));
  });

  it('BR47 only after a second confirmation are the personal data erased, and an erased account stays gone', async () => {
    const admin = await adminLogin();
    const student = await ctx.login('gone', { firstName: 'Greta', lastName: 'Gone' });
    const early = await admin.agent.delete(`/api/admin/users/${student.student.id}/permanent`);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('NOT_DELETED');

    await admin.agent.delete(`/api/admin/users/${student.student.id}`).expect(204);
    await admin.agent.delete(`/api/admin/users/${student.student.id}/permanent`).expect(204);
    const detail = (await admin.agent.get(`/api/admin/users/${student.student.id}`).expect(200))
      .body;
    expect(detail.user).toMatchObject({ status: 'deleted', erased: true, firstName: 'Deleted' });
    expect(detail.user.email).toMatch(/@deleted\.invalid$/);
    const restore = await admin.agent.post(`/api/admin/users/${student.student.id}/restore`);
    expect(restore.status).toBe(409);
    expect(restore.body.error.code).toBe('ERASED');
    const again = await admin.agent.delete(`/api/admin/users/${student.student.id}/permanent`);
    expect(again.status).toBe(409);
    // Only now can the address be used for a new account.
    const fresh = await otpLoginStatus(student.email);
    expect(fresh.status).toBe(201);
    expect(fresh.body.student.id).not.toBe(student.student.id);
  });

  it('BR47 a student who deletes their own account is erased at once and the admin log says so', async () => {
    const admin = await adminLogin();
    const student = await ctx.login('leaver', { firstName: 'Lea', lastName: 'Ver' });
    await student.agent.delete('/api/me').expect(204);
    const detail = (await admin.agent.get(`/api/admin/users/${student.student.id}`).expect(200))
      .body;
    expect(detail.user).toMatchObject({ status: 'deleted', erased: true });
    const entry = detail.events.find((e) => e.type === 'account_deleted_by_student');
    expect(entry).toBeTruthy();
    expect(Date.parse(entry.at)).toBeGreaterThan(0);
    expect(entry.byAdmin).toBe(false);
    const restore = await admin.agent.post(`/api/admin/users/${student.student.id}/restore`);
    expect(restore.body.error.code).toBe('ERASED');
    const list = await admin.agent.get('/api/admin/users?status=deleted').expect(200);
    expect(list.body.users.map((u) => u.id)).toContain(student.student.id);
  });

  it('BR47 administrators cannot be deleted, restored or erased; a deleted account is out of every ranking', async () => {
    const admin = await adminLogin();
    await admin.agent.delete(`/api/admin/users/${admin.student.id}`).expect(403);
    await admin.agent.delete(`/api/admin/users/${admin.student.id}/permanent`).expect(403);
    const student = await ctx.login('ranked');
    await ctx.pool.query('UPDATE students SET total_points = 500 WHERE student_id = ?', [
      student.student.id,
    ]);
    await admin.agent.delete(`/api/admin/users/${student.student.id}`).expect(204);
    const viewer = await ctx.login('viewer');
    const board = (await viewer.agent.get('/api/leaderboards/solo').expect(200)).body.entries;
    expect(board.map((e) => e.id)).not.toContain(student.student.id);
    await viewer.agent.get(`/api/players/${student.student.id}`).expect(404);
  });
});
