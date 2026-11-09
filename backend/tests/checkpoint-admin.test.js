import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const adminLogin = () => ctx.login('sekretariat.dski', { firstName: 'Study', lastName: 'Office' });
const LINK = (lat, lng) => `https://www.google.com/maps/@${lat},${lng},19z`;

const base = (over = {}) => ({
  name: 'TQ Sports Hall',
  description: 'The hall for sports.',
  mapLink: LINK(49.1502, 9.2201),
  radius: 40,
  questionCount: 3,
  passThreshold: 2,
  ...over,
});

const option = (text, isCorrect = false) => ({ text, isCorrect });
const mcq = (text, over = {}) => ({
  questionText: text,
  difficulty: 'NORMAL',
  questionType: 'MCQ',
  options: [option('A', true), option('B'), option('C'), option('D')],
  ...over,
});
const multi = (text, over = {}) => ({
  questionText: text,
  difficulty: 'NORMAL',
  questionType: 'MULTI',
  options: [option('A', true), option('B', true), option('C'), option('D')],
  ...over,
});

async function newQuest(admin, over = {}) {
  const res = await admin.agent.post('/api/admin/checkpoints').send(base(over));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.quest;
}
const addQuestion = (admin, quest, body) =>
  admin.agent.post(`/api/admin/checkpoints/${quest.id}/questions`).send(body);

describe('BR49 only administrators manage quests', () => {
  it('BR49 students and visitors cannot reach the quest endpoints', async () => {
    const student = await ctx.login('plain');
    await request(ctx.app).get('/api/admin/checkpoints').expect(401);
    await student.agent.get('/api/admin/checkpoints').expect(403);
    await student.agent.post('/api/admin/checkpoints').send(base()).expect(403);
    await student.agent.delete('/api/admin/checkpoints/1').expect(403);
  });

  it('BR49 lists the seeded quests with what each one still needs', async () => {
    const admin = await adminLogin();
    const { body } = await admin.agent.get('/api/admin/checkpoints').expect(200);
    expect(body.quests).toHaveLength(8);
    expect(body.quests[0]).toMatchObject({
      name: 'Mensa',
      typeMode: 'MCQ_ONLY',
      archived: false,
      readiness: { ready: true },
    });
    expect(body.quests[0].counts.questions).toBeGreaterThan(5);
  });
});

describe('BR49 creating and editing a quest', () => {
  it('BR49 creates a quest from a Google Maps link (inactive until it has questions)', async () => {
    const admin = await adminLogin();
    const quest = await newQuest(admin);
    expect(quest).toMatchObject({
      name: 'TQ Sports Hall',
      lat: 49.1502,
      lng: 9.2201,
      isActive: false,
      questionCount: 3,
      effectiveTimeLimitSeconds: 180,
      readiness: { ready: false },
    });
    expect(quest.readiness.problems[0]).toContain('3 more normal question');
    const student = await ctx.login('seeker');
    const listed = (await student.agent.get('/api/checkpoints').expect(200)).body.checkpoints;
    expect(listed.map((c) => c.name)).not.toContain('TQ Sports Hall');
  });

  it('BR51 refuses a bad link and says why', async () => {
    const admin = await adminLogin();
    const cases = [
      ['', 'EMPTY'],
      ['sports hall', 'NOT_A_LINK'],
      ['https://example.org/maps', 'NOT_GOOGLE_MAPS'],
      [LINK(52.52, 13.4), 'OUTSIDE_MAP_AREA'],
      ['https://www.google.com/maps/place/Sports+Hall', 'NO_COORDINATES'],
    ];
    for (const [mapLink, reason] of cases) {
      const res = await admin.agent.post('/api/admin/checkpoints').send(base({ mapLink }));
      expect(res.status, mapLink).toBe(400);
      expect(res.body.error).toMatchObject({ code: 'INVALID_MAP_LINK', reason });
      expect(res.body.error.message.length).toBeGreaterThan(15);
    }
    const [[{ n }]] = await ctx.pool.query(
      "SELECT COUNT(*) AS n FROM checkpoints WHERE checkpoint_name LIKE 'TQ %'",
    );
    expect(n).toBe(0);
  });

  it('BR51 the link box can be tried before saving and warns about a spot that is taken', async () => {
    const admin = await adminLogin();
    const ok = await admin.agent
      .post('/api/admin/checkpoints/check-link')
      .send({ mapLink: LINK(49.1502, 9.2201) })
      .expect(200);
    expect(ok.body).toMatchObject({ lat: 49.1502, lng: 9.2201, warnings: [] });
    const near = await admin.agent
      .post('/api/admin/checkpoints/check-link')
      .send({ mapLink: LINK(49.148464, 9.215808) })
      .expect(200);
    expect(near.body.warnings[0]).toContain('Mensa');
    const bad = await admin.agent
      .post('/api/admin/checkpoints/check-link')
      .send({ mapLink: 'nope' });
    expect(bad.body.error.reason).toBe('NOT_A_LINK');
  });

  it('BR49 checks the numbers: pass mark, hard question, types and time limit', async () => {
    const admin = await adminLogin();
    const bad = [
      base({ passThreshold: 4 }),
      base({ questionCount: 3, passThreshold: 2, hardQuestionEnabled: true }),
      base({ questionCount: 2, passThreshold: 1, typeMode: 'MIXED' }),
      base({ timeLimitSeconds: 20 }),
      base({ timeLimitSeconds: 9000 }),
      base({ name: 'X' }),
      base({ radius: 5 }),
      base({ questionCount: 11 }),
      base({ isActive: true }),
    ];
    for (const body of bad) {
      const res = await admin.agent.post('/api/admin/checkpoints').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    await newQuest(admin, { timeLimitSeconds: 300 });
    const dup = await admin.agent.post('/api/admin/checkpoints').send(base());
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('NAME_TAKEN');
  });

  it('BR49 updates details and moves the quest with a new link', async () => {
    const admin = await adminLogin();
    const quest = await newQuest(admin);
    const res = await admin.agent
      .patch(`/api/admin/checkpoints/${quest.id}`)
      .send({
        name: 'TQ Sports Arena',
        description: 'New text.',
        mapLink: LINK(49.1511, 9.2222),
        timeLimitSeconds: 240,
        radius: 60,
      })
      .expect(200);
    expect(res.body.quest).toMatchObject({
      name: 'TQ Sports Arena',
      description: 'New text.',
      lat: 49.1511,
      lng: 9.2222,
      timeLimitSeconds: 240,
      radius: 60,
    });
    const moved = await admin.agent
      .patch(`/api/admin/checkpoints/${quest.id}`)
      .send({ mapLink: LINK(10, 10) });
    expect(moved.body.error.reason).toBe('OUTSIDE_MAP_AREA');
    await admin.agent.patch('/api/admin/checkpoints/999999').send({ radius: 50 }).expect(404);
  });

  it('BR49 saves the information and the photos of a quest', async () => {
    const admin = await adminLogin();
    const quest = await newQuest(admin);
    const facts = await admin.agent
      .put(`/api/admin/checkpoints/${quest.id}/facts`)
      .send({ facts: ['Built in 2019.', 'Has 3 courts.'] })
      .expect(200);
    expect(facts.body.facts).toEqual(['Built in 2019.', 'Has 3 courts.']);
    await admin.agent
      .put(`/api/admin/checkpoints/${quest.id}/facts`)
      .send({ facts: Array(6).fill('x') })
      .expect(400);

    const png = await sharp({
      create: { width: 64, height: 48, channels: 3, background: '#335577' },
    })
      .png()
      .toBuffer();
    const added = await admin.agent
      .post(`/api/admin/checkpoints/${quest.id}/photos`)
      .field('alt', 'The hall from outside')
      .field('credit', 'Own photo')
      .attach('file', png, 'hall.png')
      .expect(201);
    expect(added.body.photos).toHaveLength(1);
    expect(added.body.photos[0]).toMatchObject({ position: 1, alt: 'The hall from outside' });
    expect(added.body.photos[0].url).toMatch(/^\/uploads\/[0-9a-f]{32}\.webp$/);

    const edited = await admin.agent
      .patch(`/api/admin/checkpoints/${quest.id}/photos/1`)
      .send({ credit: 'Studio' })
      .expect(200);
    expect(edited.body.photos[0].credit).toBe('Studio');
    await admin.agent
      .post(`/api/admin/checkpoints/${quest.id}/photos`)
      .field('alt', 'x')
      .field('credit', 'x')
      .attach('file', Buffer.from('not an image'), 'bad.png')
      .expect(400);
    const removed = await admin.agent
      .delete(`/api/admin/checkpoints/${quest.id}/photos/1`)
      .expect(200);
    expect(removed.body.photos).toEqual([]);
  });
});

describe('BR50 question types and the questions of a quest', () => {
  it('BR50 a multiple-choice question has exactly one correct option, a multi-select two or three', async () => {
    const admin = await adminLogin();
    const quest = await newQuest(admin);
    const bad = [
      mcq('Two right', {
        options: [option('A', true), option('B', true), option('C'), option('D')],
      }),
      mcq('None right', { options: [option('A'), option('B'), option('C'), option('D')] }),
      multi('One right', { options: [option('A', true), option('B'), option('C'), option('D')] }),
      multi('Four right', {
        options: [option('A', true), option('B', true), option('C', true), option('D', true)],
      }),
      mcq('Same options', { options: [option('A', true), option('a'), option('C'), option('D')] }),
      mcq('Three options', { options: [option('A', true), option('B'), option('C')] }),
    ];
    for (const body of bad) {
      const res = await addQuestion(admin, quest, body);
      expect(res.status, body.questionText).toBe(400);
    }
    const good = await addQuestion(admin, quest, multi('Which are fruit?')).then((r) => r.body);
    expect(good.questions[0]).toMatchObject({ type: 'MULTI', text: 'Which are fruit?' });
    expect(good.questions[0].options.filter((o) => o.isCorrect)).toHaveLength(2);
  });

  it('BR49 edits and deletes questions, and a quest is ready when the pool is big enough', async () => {
    const admin = await adminLogin();
    const quest = await newQuest(admin);
    let state;
    for (const text of ['One', 'Two', 'Three']) {
      state = (await addQuestion(admin, quest, mcq(text)).then((r) => r.body)).quest;
    }
    expect(state.readiness).toEqual({ ready: true, problems: [] });

    const detail = (await admin.agent.get(`/api/admin/checkpoints/${quest.id}`).expect(200)).body;
    const first = detail.questions[0];
    const changed = await admin.agent
      .put(`/api/admin/checkpoints/${quest.id}/questions/${first.id}`)
      .send(
        mcq('One (edited)', {
          options: [option('X'), option('Y', true), option('Z'), option('W')],
        }),
      )
      .expect(200);
    const edited = changed.body.questions.find((q) => q.id === first.id);
    expect(edited.text).toBe('One (edited)');
    expect(edited.options.map((o) => o.id)).toEqual(first.options.map((o) => o.id));
    expect(edited.options.find((o) => o.isCorrect).text).toBe('Y');

    const active = await admin.agent
      .patch(`/api/admin/checkpoints/${quest.id}`)
      .send({ isActive: true })
      .expect(200);
    expect(active.body.quest.isActive).toBe(true);

    const removed = await admin.agent
      .delete(`/api/admin/checkpoints/${quest.id}/questions/${first.id}`)
      .expect(200);
    expect(removed.body).toMatchObject({ result: 'erased', deactivated: true });
    expect(removed.body.quest.isActive).toBe(false);
    expect(removed.body.quest.readiness.ready).toBe(false);
    await admin.agent
      .delete(`/api/admin/checkpoints/${quest.id}/questions/${first.id}`)
      .expect(404);
  });

  it('BR49 a quest that is not ready cannot be switched on, and the reason is given', async () => {
    const admin = await adminLogin();
    const quest = await newQuest(admin, { typeMode: 'MIXED' });
    for (const text of ['One', 'Two', 'Three']) await addQuestion(admin, quest, mcq(text));
    const res = await admin.agent
      .patch(`/api/admin/checkpoints/${quest.id}`)
      .send({ isActive: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('QUEST_NOT_READY');
    expect(res.body.error.problems.join(' ')).toContain('multi-select');
    await addQuestion(admin, quest, multi('Fruit?'));
    await admin.agent
      .patch(`/api/admin/checkpoints/${quest.id}`)
      .send({ isActive: true })
      .expect(200);
  });

  it('BR50 the hard question needs a hard question of the allowed types', async () => {
    const admin = await adminLogin();
    const quest = await newQuest(admin, {
      questionCount: 4,
      passThreshold: 3,
      hardQuestionEnabled: true,
    });
    for (const text of ['One', 'Two', 'Three', 'Four']) await addQuestion(admin, quest, mcq(text));
    const early = await admin.agent
      .patch(`/api/admin/checkpoints/${quest.id}`)
      .send({ isActive: true });
    expect(early.body.error.problems.join(' ')).toContain('hard question');
    await addQuestion(admin, quest, mcq('Hard one', { difficulty: 'HARD' }));
    await admin.agent
      .patch(`/api/admin/checkpoints/${quest.id}`)
      .send({ isActive: true })
      .expect(200);
  });

  it('BR49 a question students answered is archived, one nobody saw is erased', async () => {
    const admin = await adminLogin();
    const quest = await newQuest(admin);
    for (const text of ['One', 'Two', 'Three', 'Four']) await addQuestion(admin, quest, mcq(text));
    await admin.agent
      .patch(`/api/admin/checkpoints/${quest.id}`)
      .send({ isActive: true })
      .expect(200);
    const student = await ctx.login('player');
    const attempt = await ctx.startAttempt(student.agent, 'TQ Sports Hall');

    const detail = (await admin.agent.get(`/api/admin/checkpoints/${quest.id}`).expect(200)).body;
    const shown = detail.questions.find((q) => q.id === attempt.questions[0].id);
    const locked = await admin.agent
      .delete(`/api/admin/checkpoints/${quest.id}/questions/${shown.id}`)
      .expect(409);
    expect(locked.body.error.code).toBe('QUESTION_IN_USE');
    await admin.agent
      .put(`/api/admin/checkpoints/${quest.id}/questions/${shown.id}`)
      .send(mcq('Changed while answering'))
      .expect(409);

    ctx.clock.advance(10 * 60 * 1000);
    await student.agent.get(`/api/attempts/${attempt.id}`).expect(200);
    const archived = await admin.agent
      .delete(`/api/admin/checkpoints/${quest.id}/questions/${shown.id}`)
      .expect(200);
    expect(archived.body.result).toBe('archived');
    expect(archived.body.questions.find((q) => q.id === shown.id).isActive).toBe(false);
  });
});

describe('BR49 deleting and restoring a quest', () => {
  it('BR49 a quest nobody played is erased with its questions', async () => {
    const admin = await adminLogin();
    const quest = await newQuest(admin);
    await addQuestion(admin, quest, mcq('One'));
    const res = await admin.agent.delete(`/api/admin/checkpoints/${quest.id}`).expect(200);
    expect(res.body.result).toBe('erased');
    await admin.agent.get(`/api/admin/checkpoints/${quest.id}`).expect(404);
    const [[{ n }]] = await ctx.pool.query(
      'SELECT COUNT(*) AS n FROM questions WHERE checkpoint_id = ?',
      [quest.id],
    );
    expect(n).toBe(0);
  });

  it('BR49 a quest students played is archived: hidden from students, restorable, history kept', async () => {
    const admin = await adminLogin();
    const quest = await newQuest(admin);
    for (const text of ['One', 'Two', 'Three']) await addQuestion(admin, quest, mcq(text));
    await admin.agent
      .patch(`/api/admin/checkpoints/${quest.id}`)
      .send({ isActive: true })
      .expect(200);
    const student = await ctx.login('player');
    await ctx.startAttempt(student.agent, 'TQ Sports Hall');

    const res = await admin.agent.delete(`/api/admin/checkpoints/${quest.id}`).expect(200);
    expect(res.body.result).toBe('archived');
    const list = (await admin.agent.get('/api/admin/checkpoints').expect(200)).body.quests;
    expect(list.at(-1)).toMatchObject({ name: 'TQ Sports Hall', archived: true, isActive: false });
    const seen = (await student.agent.get('/api/checkpoints').expect(200)).body.checkpoints;
    expect(seen.map((c) => c.name)).not.toContain('TQ Sports Hall');
    const edit = await admin.agent.patch(`/api/admin/checkpoints/${quest.id}`).send({ radius: 70 });
    expect(edit.body.error.code).toBe('QUEST_ARCHIVED');

    const back = await admin.agent.post(`/api/admin/checkpoints/${quest.id}/restore`).expect(200);
    expect(back.body.quest).toMatchObject({ archived: false, isActive: false });
    await admin.agent.post(`/api/admin/checkpoints/${quest.id}/restore`).expect(409);
    const [[{ n }]] = await ctx.pool.query(
      'SELECT COUNT(*) AS n FROM attempts WHERE checkpoint_id = ?',
      [quest.id],
    );
    expect(n).toBe(1);
  });

  it('BR49 every change is written to the audit log without the position', async () => {
    const admin = await adminLogin();
    const quest = await newQuest(admin);
    await admin.agent.delete(`/api/admin/checkpoints/${quest.id}`).expect(200);
    const [events] = await ctx.pool.query(
      "SELECT event_type, detail FROM audit_events WHERE event_type LIKE 'quest_%' ORDER BY event_id",
    );
    expect(events.map((e) => e.event_type)).toEqual(['quest_created', 'quest_erased']);
    expect(JSON.stringify(events)).not.toMatch(/49\.15|9\.22/);
  });
});
