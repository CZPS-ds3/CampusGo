import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  seedImages,
  seedPilotCheckpoints,
  seedPlaceholderFacts,
  seedPlaceholderQuestions,
  seedReference,
} from '../src/db/seed.js';
import { seedDemo } from '../src/db/seed-demo.js';
import { PILOT_SEEDED, writeSetting } from '../src/services/settings.js';
import { createTestContext } from './helpers.js';

// Regression for the "proxy error after a checkpoint was deleted" report (2026-11-10): deleting or archiving a quest
// must never make the API fail, and the seed that runs on every `npm run dev` must never undo or break an admin's
// changes (it used to re-create erased quests and reset question counts, which failed the ck_checkpoint CHECK and
// stopped the API from starting at all).

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const adminLogin = () => ctx.login('sekretariat.dski', { firstName: 'Study', lastName: 'Office' });
const questId = async (name) => {
  const [[row]] = await ctx.pool.query(
    'SELECT checkpoint_id FROM checkpoints WHERE checkpoint_name = ?',
    [name],
  );
  return row?.checkpoint_id ?? null;
};

/** Every page a student or an admin opens after the change. None may answer with a server error. */
async function everyPageAnswers(student, admin) {
  const studentPages = [
    '/api/me',
    '/api/checkpoints',
    '/api/attempts/active',
    '/api/teams/me',
    '/api/invitations',
    '/api/leaderboards/solo',
    `/api/players/${student.student.id}`,
  ];
  const adminPages = [
    '/api/admin/stats',
    '/api/admin/overview',
    '/api/admin/users',
    `/api/admin/users/${student.student.id}`,
    '/api/admin/teams',
    '/api/admin/checkpoints',
    '/api/admin/settings',
  ];
  for (const path of studentPages) {
    const res = await student.agent.get(path);
    expect(res.status, `${path}: ${JSON.stringify(res.body)}`).toBeLessThan(500);
  }
  for (const path of adminPages) {
    const res = await admin.agent.get(path);
    expect(res.status, `${path}: ${JSON.stringify(res.body)}`).toBe(200);
  }
  await request(ctx.app).get('/api/health').expect(200);
}

describe('BR49 deleting a quest never breaks the app', () => {
  it('BR49 after an unplayed pilot quest is erased every page still answers', async () => {
    const admin = await adminLogin();
    const student = await ctx.login('player');
    const id = await questId('Campus Garden');
    const res = await admin.agent.delete(`/api/admin/checkpoints/${id}`).expect(200);
    expect(res.body.result).toBe('erased');
    await everyPageAnswers(student, admin);
    const seen = (await student.agent.get('/api/checkpoints').expect(200)).body.checkpoints;
    expect(seen.map((c) => c.name)).not.toContain('Campus Garden');
    // A stale page that still knows the old id gets a clear 404, never a 500.
    const stale = await ctx.verify(student.agent, { id, latitude: 49.147082, longitude: 9.217206 });
    expect(stale.status).toBe(404);
    expect(stale.body.error.code).toBe('NOT_AVAILABLE');
  });

  it('BR49 after a played quest is archived every page still answers and counts only live quests', async () => {
    const admin = await adminLogin();
    const student = await ctx.login('player');
    const attempt = await ctx.startAttempt(student.agent, 'Sensoricum');
    await ctx.answerPattern(student.agent, attempt, [true, true, true]);
    const id = await questId('Sensoricum');
    const res = await admin.agent.delete(`/api/admin/checkpoints/${id}`).expect(200);
    expect(res.body.result).toBe('archived');
    ctx.clock.advance(31_000); // the dashboard numbers are cached for 30 s
    await everyPageAnswers(student, admin);

    const stats = (await admin.agent.get('/api/admin/stats').expect(200)).body;
    expect(stats.checkpoints.map((c) => c.name)).not.toContain('Sensoricum');
    const user = (await admin.agent.get(`/api/admin/users/${student.student.id}`).expect(200)).body
      .user;
    expect(user).toMatchObject({ questsPassed: 0, questsTotal: 7 });
    const player = (await student.agent.get(`/api/players/${student.student.id}`).expect(200)).body;
    expect(player.player.questsCleared).toBe(0);
    // The points earned there stay (history is kept, BR49).
    expect(player.player.totalPoints).toBeGreaterThan(0);
  });

  it('BR49 the admin quest page says "archived" when only a location check exists', async () => {
    const admin = await adminLogin();
    const student = await ctx.login('walker');
    await student.agent.post('/api/me/location-consent').expect(204);
    const checkpoint = await ctx.checkpointByName(student.agent, 'Library');
    // Far outside: a location check is stored, but no attempt starts.
    await ctx.verify(student.agent, checkpoint, { offset: 0.01 }).expect(200);
    const id = await questId('Library');
    const detail = (await admin.agent.get(`/api/admin/checkpoints/${id}`).expect(200)).body.quest;
    expect(detail.hasHistory).toBe(true);
    const res = await admin.agent.delete(`/api/admin/checkpoints/${id}`).expect(200);
    expect(res.body.result).toBe('archived');
  });

  it('BR49 erasing a quest also deletes its uploaded photo files', async () => {
    const admin = await adminLogin();
    const created = await admin.agent
      .post('/api/admin/checkpoints')
      .send({
        name: 'TQ Photo Hall',
        description: 'A hall.',
        mapLink: 'https://www.google.com/maps/@49.1502,9.2201,19z',
        radius: 40,
        questionCount: 3,
        passThreshold: 2,
      })
      .expect(201);
    const png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    const added = await admin.agent
      .post(`/api/admin/checkpoints/${created.body.quest.id}/photos`)
      .field('alt', 'Front')
      .field('credit', 'Own photo')
      .attach('file', png, 'front.png')
      .expect(201);
    const file = resolve(ctx.config.uploadDir, basename(added.body.photos[0].url));
    expect(existsSync(file)).toBe(true);
    await admin.agent.delete(`/api/admin/checkpoints/${created.body.quest.id}`).expect(200);
    expect(existsSync(file)).toBe(false);
  });
});

describe('BR49 the seed leaves quests to the admins', () => {
  it('BR49 an erased pilot quest is not brought back by the next seed', async () => {
    await writeSetting(ctx.pool, PILOT_SEEDED, 'true');
    const admin = await adminLogin();
    await admin.agent.delete(`/api/admin/checkpoints/${await questId('Mensa')}`).expect(200);
    expect(await seedReference(ctx.pool)).toEqual([]);
    expect(await questId('Mensa')).toBeNull();
  });

  it('BR49 BR11 the seed does not reset an admin-set question count, pass mark or time limit (no CHECK failure)', async () => {
    await writeSetting(ctx.pool, PILOT_SEEDED, 'true');
    const admin = await adminLogin();
    const id = await questId('CAS Cafe');
    await admin.agent
      .patch(`/api/admin/checkpoints/${id}`)
      .send({ isActive: false, questionCount: 1, passThreshold: 1, timeLimitSeconds: 20 })
      .expect(200);
    // This is what crashed `npm run dev` before: the old seed set question_count back to 3 (CHECK: 20 s < 3 x 10 s).
    await expect(seedReference(ctx.pool)).resolves.toEqual([]);
    await expect(
      seedPlaceholderQuestions(ctx.pool, { checkpointIds: [] }),
    ).resolves.toBeUndefined();
    const [[row]] = await ctx.pool.query(
      'SELECT question_count, pass_threshold, time_limit_seconds FROM checkpoints WHERE checkpoint_id = ?',
      [id],
    );
    expect(row).toEqual({ question_count: 1, pass_threshold: 1, time_limit_seconds: 20 });
  });

  it('BR49 the first seed of an empty database creates the 8 pilot quests once', async () => {
    await ctx.pool.query("DELETE FROM app_settings WHERE setting_key = 'pilot_checkpoints_seeded'");
    // All 8 exist already (test reset), so nothing new is created, but the marker is written.
    expect(await seedPilotCheckpoints(ctx.pool)).toEqual([]);
    const [[marker]] = await ctx.pool.query(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'pilot_checkpoints_seeded'",
    );
    expect(marker.setting_value).toBe('true');
  });

  it('BR49 placeholder questions, facts and photos never go into admin quests or replace uploads', async () => {
    const admin = await adminLogin();
    const created = await admin.agent
      .post('/api/admin/checkpoints')
      .send({
        name: 'TQ Empty Hall',
        description: 'Nothing yet.',
        mapLink: 'https://www.google.com/maps/@49.1505,9.2205,19z',
        radius: 40,
        questionCount: 3,
        passThreshold: 2,
      })
      .expect(201);
    const id = created.body.quest.id;
    await seedPlaceholderQuestions(ctx.pool);
    await seedPlaceholderFacts(ctx.pool);
    await seedImages(ctx.pool);
    const [[counts]] = await ctx.pool.query(
      `SELECT (SELECT COUNT(*) FROM questions WHERE checkpoint_id = ?) AS questions,
              (SELECT COUNT(*) FROM checkpoint_facts WHERE checkpoint_id = ?) AS facts,
              (SELECT COUNT(*) FROM checkpoint_images WHERE checkpoint_id = ?) AS photos`,
      [id, id, id],
    );
    expect(counts).toEqual({ questions: 0, facts: 0, photos: 0 });

    // A pilot quest with an uploaded photo keeps it: the seed only fills quests without any photo.
    const garden = await questId('Campus Garden');
    await ctx.pool.query('DELETE FROM checkpoint_images WHERE checkpoint_id = ?', [garden]);
    await ctx.pool.query(
      "INSERT INTO checkpoint_images (checkpoint_id, position, url, alt_text, credit) VALUES (?, 1, '/uploads/own.webp', 'Own', 'Admin')",
      [garden],
    );
    await seedImages(ctx.pool);
    const [photos] = await ctx.pool.query(
      'SELECT url FROM checkpoint_images WHERE checkpoint_id = ?',
      [garden],
    );
    expect(photos).toEqual([{ url: '/uploads/own.webp' }]);
  });

  it('BR49 the demo seed works with fewer than 8 quests and skips archived ones', async () => {
    const admin = await adminLogin();
    await admin.agent.delete(`/api/admin/checkpoints/${await questId('Building B')}`).expect(200);
    const student = await ctx.login('player');
    const attempt = await ctx.startAttempt(student.agent, 'Sensoricum');
    await ctx.answerPattern(student.agent, attempt, [true, true, true]);
    const sensoricum = await questId('Sensoricum');
    await admin.agent.delete(`/api/admin/checkpoints/${sensoricum}`).expect(200);
    await expect(seedDemo(ctx.pool, ctx.clock.now())).resolves.toBe(true);
    const [[{ demoOnArchived }]] = await ctx.pool.query(
      'SELECT COUNT(*) AS demoOnArchived FROM attempts WHERE checkpoint_id = ? AND student_id <> ?',
      [sensoricum, student.student.id],
    );
    expect(demoOnArchived).toBe(0);
    // Every demo team has a leader and a full team order (BR44, BR54).
    const [teams] = await ctx.pool.query('SELECT leader_id FROM teams');
    expect(teams.length).toBeGreaterThan(0);
    expect(teams.every((t) => t.leader_id !== null)).toBe(true);
    const [[{ unordered }]] = await ctx.pool.query(
      'SELECT COUNT(*) AS unordered FROM students WHERE team_id IS NOT NULL AND team_position IS NULL',
    );
    expect(unordered).toBe(0);
    // The demo seed writes many players and attempts: about 15 s on a Linux CI container, too close to the 20 s default.
  }, 60_000);
});
