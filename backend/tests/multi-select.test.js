import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const adminLogin = () => ctx.login('sekretariat.dski', { firstName: 'Study', lastName: 'Office' });
const option = (text, isCorrect = false) => ({ text, isCorrect });
const question = (text, type, over = {}) => ({
  questionText: text,
  difficulty: 'NORMAL',
  questionType: type,
  options:
    type === 'MCQ'
      ? [option('A', true), option('B'), option('C'), option('D')]
      : [option('A', true), option('B', true), option('C'), option('D')],
  ...over,
});

/** A quest of this type mode with enough questions of both types, switched on. */
async function liveQuest(admin, { typeMode, count = 3, pass = 2, extra = {}, questions }) {
  const created = await admin.agent
    .post('/api/admin/checkpoints')
    .send({
      name: 'TQ Quiz Room',
      mapLink: 'https://www.google.com/maps/@49.1502,9.2201,19z',
      radius: 40,
      questionCount: count,
      passThreshold: pass,
      typeMode,
      ...extra,
    })
    .expect(201);
  const id = created.body.quest.id;
  for (const body of questions) {
    await admin.agent.post(`/api/admin/checkpoints/${id}/questions`).send(body).expect(201);
  }
  await admin.agent.patch(`/api/admin/checkpoints/${id}`).send({ isActive: true }).expect(200);
  return id;
}

const rightIds = async (questionId) => {
  const [rows] = await ctx.pool.query(
    'SELECT option_id FROM options WHERE question_id = ? AND is_correct = 1 ORDER BY option_id',
    [questionId],
  );
  return rows.map((r) => r.option_id);
};
const wrongIds = async (questionId) => {
  const [rows] = await ctx.pool.query(
    'SELECT option_id FROM options WHERE question_id = ? AND is_correct = 0 ORDER BY option_id',
    [questionId],
  );
  return rows.map((r) => r.option_id);
};
const current = (attempt) => attempt.questions.find((q) => q.number === attempt.currentQuestion);
const send = (agent, attempt, body) => agent.post(`/api/attempts/${attempt.id}/answers`).send(body);

const MIXED = [
  question('Mcq 1', 'MCQ'),
  question('Mcq 2', 'MCQ'),
  question('Multi 1', 'MULTI'),
  question('Multi 2', 'MULTI'),
];

describe('BR50 students are told which question types come', () => {
  it('BR50 the quest list names the types (MCQ, multi-select or both) and the time limit', async () => {
    const admin = await adminLogin();
    await liveQuest(admin, {
      typeMode: 'MIXED',
      extra: { timeLimitSeconds: 300 },
      questions: MIXED,
    });
    const student = await ctx.login('reader');
    const quests = (await student.agent.get('/api/checkpoints').expect(200)).body.checkpoints;
    const mine = quests.find((c) => c.name === 'TQ Quiz Room');
    expect(mine).toMatchObject({
      typeMode: 'MIXED',
      questionTypes: ['MCQ', 'MULTI'],
      timeLimitSeconds: 300,
    });
    const mensa = quests.find((c) => c.name === 'Mensa');
    expect(mensa).toMatchObject({ typeMode: 'MCQ_ONLY', questionTypes: ['MCQ'] });
    expect(mensa.timeLimitSeconds).toBe(mensa.questionCount * 60);
  });

  it('BR50 a mixed quest always holds both types, so what the student was told is true', async () => {
    const admin = await adminLogin();
    await liveQuest(admin, { typeMode: 'MIXED', questions: MIXED });
    for (let round = 0; round < 8; round += 1) {
      const student = await ctx.login(`mixed${round}`);
      const attempt = await ctx.startAttempt(student.agent, 'TQ Quiz Room');
      const types = attempt.questions.map((q) => q.type);
      expect(types).toContain('MCQ');
      expect(types).toContain('MULTI');
      expect(new Set(attempt.questions.map((q) => q.id)).size).toBe(3);
    }
  });

  it('BR50 a quest of one type draws only that type', async () => {
    const admin = await adminLogin();
    await liveQuest(admin, {
      typeMode: 'MULTI_ONLY',
      questions: [1, 2, 3, 4].map((n) => question(`M${n}`, 'MULTI')),
    });
    const student = await ctx.login('multi');
    const attempt = await ctx.startAttempt(student.agent, 'TQ Quiz Room');
    expect(attempt.questions.map((q) => q.type)).toEqual(['MULTI', 'MULTI', 'MULTI']);
  });

  it('BR50 the time limit of the quest sets the deadline of the attempt (server clock)', async () => {
    const admin = await adminLogin();
    await liveQuest(admin, {
      typeMode: 'MCQ_ONLY',
      extra: { timeLimitSeconds: 90 },
      questions: [1, 2, 3].map((n) => question(`Q${n}`, 'MCQ')),
    });
    const student = await ctx.login('timer');
    const attempt = await ctx.startAttempt(student.agent, 'TQ Quiz Room');
    expect(attempt.timeLimitSeconds).toBe(90);
    expect(Date.parse(attempt.expiresAt) - Date.parse(attempt.serverNow)).toBe(90_000);
    ctx.clock.advance(91_000);
    const after = (await student.agent.get(`/api/attempts/${attempt.id}`).expect(200)).body.attempt;
    expect(after.status).toBe('failed');
    expect(after.endReason).toBe('expired');
  });
});

describe('BR50 multi-select is judged by an exact match', () => {
  async function startMulti(name = 'only') {
    const admin = await adminLogin();
    await liveQuest(admin, {
      typeMode: 'MULTI_ONLY',
      questions: [1, 2, 3, 4].map((n) => question(`M${n}`, 'MULTI')),
    });
    const student = await ctx.login(name);
    const attempt = await ctx.startAttempt(student.agent, 'TQ Quiz Room');
    return { student, attempt };
  }

  it('BR50 all right options and nothing else is correct', async () => {
    const { student, attempt } = await startMulti();
    const right = await rightIds(current(attempt).id);
    const res = await send(student.agent, attempt, { optionIds: right }).expect(200);
    expect(res.body.correct).toBe(true);
    expect(res.body.correctOptionIds).toBeUndefined();
    const saved = current(res.body.attempt);
    expect(res.body.attempt.questions[0].selectedOptionIds).toEqual(right);
    expect(saved.number).toBe(2);
  });

  it('BR50 a missing right option, an extra wrong one or only wrong ones is incorrect, and the answer is then shown', async () => {
    for (const build of [
      async (q) => (await rightIds(q)).slice(0, 1),
      async (q) => [...(await rightIds(q)), (await wrongIds(q))[0]],
      async (q) => (await wrongIds(q)).slice(0, 2),
    ]) {
      await ctx.reset();
      const { student, attempt } = await startMulti('s' + Math.random().toString(36).slice(2, 8));
      const q = current(attempt);
      expect(q.correctOptionIds).toBeUndefined();
      const res = await send(student.agent, attempt, { optionIds: await build(q.id) }).expect(200);
      expect(res.body.correct).toBe(false);
      expect(res.body.correctOptionIds).toEqual(await rightIds(q.id));
      expect(res.body.attempt.questions[0].correctOptionIds).toEqual(await rightIds(q.id));
    }
  });

  it('BR50 the question never says how many options are right before it is answered', async () => {
    const { attempt } = await startMulti();
    const text = JSON.stringify(attempt);
    expect(text).not.toMatch(/isCorrect|is_correct|correctOptionIds|correctCount/);
  });

  it('BR50 rejects options of another question, an empty answer and duplicates are collapsed', async () => {
    const { student, attempt } = await startMulti();
    const q = current(attempt);
    const [[other]] = await ctx.pool.query(
      'SELECT option_id FROM options WHERE question_id <> ? LIMIT 1',
      [q.id],
    );
    const foreign = await send(student.agent, attempt, { optionIds: [other.option_id] });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe('INVALID_OPTION');
    await send(student.agent, attempt, { optionIds: [] }).expect(400);
    await send(student.agent, attempt, {}).expect(400);
    const right = await rightIds(q.id);
    const dup = await send(student.agent, attempt, { optionIds: [...right, ...right] }).expect(200);
    expect(dup.body.correct).toBe(true);
  });

  it('BR50 a single-choice question refuses two ticked options', async () => {
    const admin = await adminLogin();
    await liveQuest(admin, {
      typeMode: 'MCQ_ONLY',
      questions: [1, 2, 3].map((n) => question(`Q${n}`, 'MCQ')),
    });
    const student = await ctx.login('single');
    const attempt = await ctx.startAttempt(student.agent, 'TQ Quiz Room');
    const q = current(attempt);
    const res = await send(student.agent, attempt, {
      optionIds: [...(await rightIds(q.id)), ...(await wrongIds(q.id)).slice(0, 1)],
    });
    expect(res.status).toBe(400);
    const ok = await send(student.agent, attempt, { optionId: (await rightIds(q.id))[0] });
    expect(ok.body.correct).toBe(true);
  });

  it('BR14 BR19 a full multi-select attempt scores like any other attempt', async () => {
    const { student, attempt } = await startMulti();
    let view = attempt;
    let res;
    for (let i = 0; i < 3; i += 1) {
      res = await send(student.agent, view, { optionIds: await rightIds(current(view).id) }).expect(
        200,
      );
      view = res.body.attempt;
    }
    expect(res.body.result).toMatchObject({
      passed: true,
      correctCount: 3,
      questionCount: 3,
      attemptNumber: 1,
    });
    expect(res.body.result.pointsEarned).toBeGreaterThanOrEqual(3000);
  });

  it('BR21 a quest edit after the start cannot change the pass mark of a running attempt', async () => {
    const admin = await adminLogin();
    const id = await liveQuest(admin, {
      typeMode: 'MCQ_ONLY',
      questions: [1, 2, 3, 4].map((n) => question(`Q${n}`, 'MCQ')),
    });
    const student = await ctx.login('steady');
    const attempt = await ctx.startAttempt(student.agent, 'TQ Quiz Room');
    await admin.agent.patch(`/api/admin/checkpoints/${id}`).send({ passThreshold: 3 }).expect(200);
    let view = attempt;
    let res;
    for (const correct of [true, true, false]) {
      res = await ctx.answer(student.agent, view, correct);
      view = res.body.attempt;
    }
    expect(res.body.result).toMatchObject({ passed: true, passThreshold: 2, questionCount: 3 });
  });
});
