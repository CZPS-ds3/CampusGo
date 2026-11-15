import { existsSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { CHECKPOINTS, seedQuestionBank } from '../src/db/seed.js';
import { QUESTION_BANK } from '../src/db/question-bank.js';
import { QUESTION_BANK_SEEDED, readSetting } from '../src/services/settings.js';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const PUBLIC = new URL('../../frontend/public/', import.meta.url);
const LARGE = CHECKPOINTS.filter((c) => c[4] === 5).map((c) => c[0]);

/** Runs `work` on one connection inside a transaction that is always rolled back (the test DB keeps placeholders). */
async function rolledBack(work) {
  const conn = await ctx.pool.getConnection();
  try {
    await conn.beginTransaction();
    return await work(conn);
  } finally {
    await conn.rollback();
    conn.release();
  }
}

describe('BR07 BR09 BR10 BR11 the team question bank (Main Project Document pages 7-14)', () => {
  it('BR07 covers exactly the 8 pilot checkpoints', () => {
    expect(Object.keys(QUESTION_BANK).sort()).toEqual(CHECKPOINTS.map((c) => c[0]).sort());
  });

  it('BR09 has enough questions: 8 normal + 3 hard at the large checkpoints, 6 or more at the small ones', () => {
    for (const [name, questions] of Object.entries(QUESTION_BANK)) {
      const normal = questions.filter((q) => q.difficulty === 'NORMAL' && q.type === 'MCQ');
      const hard = questions.filter((q) => q.difficulty === 'HARD');
      if (LARGE.includes(name)) {
        expect(normal.length, name).toBeGreaterThanOrEqual(5 + 2); // 5 drawn, a fresh draw still varies
        expect(hard.length, name).toBe(3);
      } else {
        expect(normal.length, name).toBeGreaterThanOrEqual(6);
        expect(hard.length, name).toBe(0);
      }
    }
  });

  it('BR10 BR50 every question has four options and 1 right (MCQ) or 2-3 right (MULTI), all texts fit the columns', () => {
    for (const [name, questions] of Object.entries(QUESTION_BANK)) {
      const texts = new Set();
      for (const q of questions) {
        expect(q.options, `${name}: ${q.text}`).toHaveLength(4);
        expect(new Set(q.options).size, q.text).toBe(4);
        expect(q.right.every((i) => Number.isInteger(i) && i >= 0 && i <= 3)).toBe(true);
        if (q.type === 'MCQ') expect(q.right, q.text).toHaveLength(1);
        else expect(q.right.length, q.text).toBeGreaterThanOrEqual(2);
        expect(q.text.length).toBeLessThanOrEqual(500);
        expect(q.options.every((o) => o.length > 0 && o.length <= 255)).toBe(true);
        expect(q.text).not.toMatch(/PLACEHOLDER/);
        expect(texts.has(q.text), `duplicate in ${name}: ${q.text}`).toBe(false);
        texts.add(q.text);
      }
    }
  });

  it('BR09 the two questions with two right answers from the document are multi-select', () => {
    const multi = Object.values(QUESTION_BANK)
      .flat()
      .filter((q) => q.type === 'MULTI')
      .map((q) => q.text);
    expect(multi).toEqual([
      'Where are the IT support rooms located?',
      'Which floors are the quiet floors?',
    ]);
  });

  it('BR11 every photo file exists, has alt text, and only photos needed to answer are shown with the question', () => {
    const shownWithQuestion = [];
    for (const q of Object.values(QUESTION_BANK).flat()) {
      expect(q.photos.length).toBeLessThanOrEqual(10);
      for (const p of q.photos) {
        expect(existsSync(new URL(p.url.slice(1), PUBLIC)), p.url).toBe(true);
        expect(p.alt.length).toBeGreaterThan(5);
        expect(p.alt.length).toBeLessThanOrEqual(200);
        expect(['question', 'answer']).toContain(p.shown);
        if (p.shown === 'question') shownWithQuestion.push(q.text);
      }
    }
    expect([...new Set(shownWithQuestion)].sort()).toEqual([
      'How many of these lights are there in the CAS?',
      'How many of these lights are there on the first floor?',
      'What does the first number, "3", on the bookshelf shown in the picture represent?',
    ]);
  });
});

describe('BR11 BR55 seeding the question bank', () => {
  it('BR11 fills the pilot quests once, switches the placeholder questions off and keeps admin questions', async () => {
    await rolledBack(async (conn) => {
      const [[mensa]] = await conn.query(
        "SELECT checkpoint_id FROM checkpoints WHERE checkpoint_name = 'Mensa'",
      );
      await conn.query(
        "INSERT INTO questions (checkpoint_id, difficulty, question_text, is_active) VALUES (?, 'NORMAL', 'Admin question?', 1)",
        [mensa.checkpoint_id],
      );
      const added = await seedQuestionBank(conn);
      expect(added).toBe(69); // 4 x (8 + 3) + 7 + 3 x 6
      const [[counts]] = await conn.query(
        `SELECT SUM(is_active = 1 AND question_text LIKE 'PLACEHOLDER%') AS livePlaceholders,
                SUM(is_active = 1 AND question_text = 'Admin question?') AS admin,
                SUM(is_active = 1) AS live
         FROM questions`,
      );
      expect(Number(counts.livePlaceholders)).toBe(0);
      expect(Number(counts.admin)).toBe(1);
      expect(Number(counts.live)).toBe(70);
      const [[{ photos }]] = await conn.query('SELECT COUNT(*) AS photos FROM question_images');
      expect(Number(photos)).toBe(32);
      expect(await readSetting(conn, QUESTION_BANK_SEEDED)).toBe('true');
      // BR55: a second seed changes nothing, even after an admin switched a bank question off.
      await conn.query(
        "UPDATE questions SET is_active = 0 WHERE question_text = 'Is Mensa open on Saturdays?'",
      );
      expect(await seedQuestionBank(conn)).toBe(0);
      const [[again]] = await conn.query(
        "SELECT is_active FROM questions WHERE question_text = 'Is Mensa open on Saturdays?'",
      );
      expect(again.is_active).toBe(0);
    });
  });

  it('BR11 a seed that stopped half-way adds only the questions that are missing', async () => {
    await rolledBack(async (conn) => {
      const small = { Sensoricum: QUESTION_BANK.Sensoricum.slice(0, 2) };
      expect(await seedQuestionBank(conn, { bank: small })).toBe(2);
      await conn.query("DELETE FROM app_settings WHERE setting_key = 'question_bank_v1'");
      expect(await seedQuestionBank(conn, { bank: { Sensoricum: QUESTION_BANK.Sensoricum } })).toBe(
        QUESTION_BANK.Sensoricum.length - 2,
      );
    });
  });

  it('BR09 BR50 a multi-select bank question keeps its two right options', async () => {
    await rolledBack(async (conn) => {
      await seedQuestionBank(conn);
      const [rows] = await conn.query(
        `SELECT q.question_type, o.option_text FROM questions q JOIN options o ON o.question_id = q.question_id
         WHERE q.question_text = 'Which floors are the quiet floors?' AND o.is_correct = 1 ORDER BY o.option_position`,
      );
      expect(rows.map((r) => r.option_text)).toEqual(['Floor 4', 'Floor 5']);
      expect(rows[0].question_type).toBe('MULTI');
    });
  });
});

describe('BR14 BR22 question photos in the quiz', () => {
  async function addPhotos(checkpointName) {
    const [questions] = await ctx.pool.query(
      `SELECT q.question_id FROM questions q JOIN checkpoints c ON c.checkpoint_id = q.checkpoint_id
       WHERE c.checkpoint_name = ? AND q.is_active = 1`,
      [checkpointName],
    );
    for (const { question_id: id } of questions) {
      await ctx.pool.query(
        `INSERT INTO question_images (question_id, position, url, alt_text, credit, shown) VALUES
         (?, 1, '/quests/x/with.jpg', 'Needed to answer', 'Team', 'question'),
         (?, 2, '/quests/x/after.jpg', 'Gives the answer away', 'Team', 'answer')`,
        [id, id],
      );
    }
  }

  it('BR14 a photo needed to answer comes with the question, a photo showing the answer only after answering', async () => {
    await addPhotos('Sensoricum');
    const student = await ctx.login('photo');
    const attempt = await ctx.startAttempt(student.agent, 'Sensoricum');
    const first = attempt.questions[0];
    expect(first.images).toEqual([
      { url: '/quests/x/with.jpg', alt: 'Needed to answer', credit: 'Team' },
    ]);
    expect(first.answerImages).toEqual([]);
    expect(JSON.stringify(attempt)).not.toContain('after.jpg');

    const res = await ctx.answer(student.agent, attempt, false);
    expect(res.status).toBe(200);
    const answered = res.body.attempt.questions[0];
    expect(answered.answerImages).toEqual([
      { url: '/quests/x/after.jpg', alt: 'Gives the answer away', credit: 'Team' },
    ]);
    // The next question's answer photo stays hidden until it is answered too.
    expect(res.body.attempt.questions[1].answerImages).toEqual([]);
  });

  it('BR11 the admin quest page lists the photos of each question with when they are shown', async () => {
    await addPhotos('Sensoricum');
    const admin = await ctx.login('sekretariat.dski', { firstName: 'Study', lastName: 'Office' });
    const { quests } = (await admin.agent.get('/api/admin/checkpoints').expect(200)).body;
    const sensoricum = quests.find((q) => q.name === 'Sensoricum');
    const detail = (await admin.agent.get(`/api/admin/checkpoints/${sensoricum.id}`).expect(200))
      .body;
    const withPhotos = detail.questions.find((q) => q.isActive);
    expect(withPhotos.images.map((i) => i.shown)).toEqual(['question', 'answer']);
  });
});
