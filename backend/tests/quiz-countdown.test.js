import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

// R-66: after the location check a 3-2-1 countdown runs; the questions and the quiz time start when it ends.
const ctx = await createTestContext({ QUIZ_COUNTDOWN_SECONDS: '3' });
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

/** Unlocks Campus Garden (3 questions, 3:00) and returns the attempt as the verify call sent it. */
async function unlock(local) {
  const student = await ctx.login(local);
  const attempt = await ctx.startAttempt(student.agent, 'Campus Garden');
  return { student, attempt };
}

describe('R-66 the 3-2-1 countdown before the first question', () => {
  it('R-66 BR13 the quiz starts 3 s after the unlock and keeps its full time limit', async () => {
    const student = await ctx.login('count1');
    const unlockedAt = ctx.clock.now();
    const attempt = await ctx.startAttempt(student.agent, 'Campus Garden');
    expect(Date.parse(attempt.startTime)).toBe(unlockedAt + 3000);
    expect(Date.parse(attempt.expiresAt)).toBe(unlockedAt + 3000 + 180_000);
    expect(attempt.timeLimitSeconds).toBe(180);
  });

  it('R-66 BR22 during the countdown no question is sent and no answer is accepted (server clock)', async () => {
    const { student, attempt } = await unlock('count2');
    expect(attempt.questions).toEqual([]);
    ctx.clock.advance(2999);
    const early = await student.agent.get(`/api/attempts/${attempt.id}`).expect(200);
    expect(early.body.attempt.questions).toEqual([]);
    const [[option]] = await ctx.pool.query(
      `SELECT o.option_id FROM attempt_questions aq JOIN options o ON o.question_id = aq.question_id
       WHERE aq.attempt_id = ? AND aq.question_number = 1 LIMIT 1`,
      [attempt.id],
    );
    const refused = await student.agent
      .post(`/api/attempts/${attempt.id}/answers`)
      .send({ optionId: option.option_id });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('QUIZ_NOT_STARTED');
  });

  it('R-66 once the countdown is over the questions come and can be answered', async () => {
    const { student, attempt } = await unlock('count3');
    ctx.clock.advance(3000);
    const started = (await student.agent.get(`/api/attempts/${attempt.id}`).expect(200)).body
      .attempt;
    expect(started.questions).toHaveLength(3);
    const res = await ctx.answer(student.agent, started, true);
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
  });

  it('BR17 R-66 the countdown costs no time bonus: a clear 60 s after the start keeps 120 s', async () => {
    const { student, attempt } = await unlock('count4');
    ctx.clock.advance(3000 + 60_000);
    const started = (await student.agent.get(`/api/attempts/${attempt.id}`).expect(200)).body
      .attempt;
    const res = await ctx.answerPattern(student.agent, started, [true, true, true]);
    expect(res.body.result.timeBonus).toBe(120);
  });

  it('BR12 R-66 a second location check during the countdown resumes the same attempt', async () => {
    const { student, attempt } = await unlock('count5');
    const checkpoint = await ctx.checkpointByName(student.agent, 'Campus Garden');
    const again = await ctx.verify(student.agent, checkpoint);
    expect(again.body.status).toBe('OK');
    expect(again.body.attempt.id).toBe(attempt.id);
    expect(again.body.attempt.startTime).toBe(attempt.startTime);
  });
});
