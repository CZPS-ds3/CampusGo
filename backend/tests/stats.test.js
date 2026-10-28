import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { berlinDays } from '../src/services/stats.js';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const HOUR = 3600 * 1000;

describe('BR29 admin dashboard numbers', () => {
  it('BR29 Berlin days are 14 and the clock change days are 25 and 23 hours long', () => {
    const autumn = berlinDays(Date.UTC(2026, 9, 28, 12)); // 28 Oct 2026, after the change on 25 Oct
    expect(autumn).toHaveLength(14);
    expect(autumn.at(-1).date).toBe('2026-10-28');
    const change = autumn.find((d) => d.date === '2026-10-25');
    expect((change.end - change.start) / HOUR).toBe(25);
    const spring = berlinDays(Date.UTC(2026, 2, 31, 12)); // clocks went forward on 29 Mar 2026
    const short = spring.find((d) => d.date === '2026-03-29');
    expect((short.end - short.start) / HOUR).toBe(23);
  });

  it('BR29 stats count students only, split by day, and name nobody who is blocked', async () => {
    const admin = await ctx.login('sekretariat.dski', { firstName: 'Study', lastName: 'Office' });
    const anna = await ctx.login('anna', { nickname: 'Anni' });
    const ben = await ctx.login('ben', { nickname: 'Benny' });
    const attempt = await ctx.startAttempt(anna.agent, 'Sensoricum');
    await ctx.answerPattern(anna.agent, attempt, [true, true, true]);
    await admin.agent
      .post(`/api/admin/users/${ben.student.id}/status`)
      .send({ status: 'blocked' })
      .expect(200);

    const res = await admin.agent.get('/api/admin/stats').expect(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    const stats = res.body;
    expect(stats.errors).toEqual({});
    expect(stats.daily).toHaveLength(14);
    const today = stats.daily.at(-1);
    expect(today.logins).toBe(2); // the admin's own login is not counted
    expect(today.passed).toBe(1);
    expect(stats.tiles).toMatchObject({ loginsToday: 2, questsPassedToday: 1, activeStudents: 1 });
    expect(stats.usersByStatus).toEqual({ active: 1, blocked: 1, archived: 0, deleted: 0 });
    expect(stats.checkpoints).toHaveLength(8);
    const sensoricum = stats.checkpoints.find((c) => c.name === 'Sensoricum');
    expect(sensoricum).toMatchObject({ attempts: 1, passed: 1, passRate: 1 });
    expect(stats.checkpoints.find((c) => c.name === 'Mensa').passRate).toBeNull();
    expect(stats.topPlayers[0]).toMatchObject({ rank: 1, displayName: 'Anni' });
    const feed = JSON.stringify(stats.recent);
    expect(feed).toContain('passed');
    expect(feed).not.toContain('Benny');
    expect(feed).not.toContain('@');
  });

  it('BR26 students cannot read the stats', async () => {
    const student = await ctx.login('student');
    await student.agent.get('/api/admin/stats').expect(403);
  });
});
