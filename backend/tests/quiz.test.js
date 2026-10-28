import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const SECOND = 1000;
const MINUTE = 60 * SECOND;

const consent = (agent) => agent.post('/api/me/location-consent').expect(204);
const count = async (table) => (await ctx.pool.query(`SELECT COUNT(*) AS n FROM ${table}`))[0][0].n;

describe('BR07 BR08 checkpoints', () => {
  it('BR07 eight pilot checkpoints are listed with their question rules', async () => {
    const { agent } = await ctx.login('list');
    const { body } = await agent.get('/api/checkpoints').expect(200);
    expect(body.checkpoints).toHaveLength(8);
    const library = body.checkpoints.find((c) => c.name === 'Library');
    expect(library).toMatchObject({
      questionCount: 5,
      passThreshold: 4,
      hardQuestionEnabled: true,
    });
    const sensoricum = body.checkpoints.find((c) => c.name === 'Sensoricum');
    expect(sensoricum).toMatchObject({
      questionCount: 3,
      passThreshold: 2,
      hardQuestionEnabled: false,
    });
  });

  it('BR08 test 8: an inactive checkpoint is hidden from the map and cannot unlock a quiz', async () => {
    const { agent } = await ctx.login('inactive');
    await consent(agent);
    const mensa = await ctx.checkpointByName(agent, 'Mensa');
    await ctx.pool.query('UPDATE checkpoints SET is_active = 0 WHERE checkpoint_id = ?', [
      mensa.id,
    ]);
    expect(await ctx.checkpointByName(agent, 'Mensa')).toBeUndefined();
    const res = await ctx.verify(agent, mensa);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_AVAILABLE');
    expect(await count('attempts')).toBe(0);
  });
});

describe('BR12 geofence verification (Main Project Document, section 9)', () => {
  it('test 2: a fresh reading inside the circle unlocks the quiz and starts the timer', async () => {
    const { agent } = await ctx.login('inside');
    await consent(agent);
    const cp = await ctx.checkpointByName(agent, 'Library');
    const res = await ctx.verify(agent, cp, { accuracy: 10 }).expect(200);
    expect(res.body).toMatchObject({ status: 'OK', resumed: false });
    const { attempt } = res.body;
    expect(attempt.attemptNumber).toBe(1);
    expect(Date.parse(attempt.expiresAt) - Date.parse(attempt.startTime)).toBe(5 * MINUTE);
    const [[check]] = await ctx.pool.query('SELECT * FROM location_checks');
    expect(check).toMatchObject({ inside_radius: 1, used_by_attempt_id: attempt.id });
  });

  it('test 3: outside the circle answers OUTSIDE with a rounded distance and starts nothing', async () => {
    const { agent } = await ctx.login('far');
    await consent(agent);
    const cp = await ctx.checkpointByName(agent, 'Library');
    const res = await ctx.verify(agent, cp, { offset: 0.002 }).expect(200);
    expect(res.body.status).toBe('OUTSIDE');
    expect(res.body.distanceM).toBe(220); // 0.002 degrees of latitude is about 222 m
    expect(res.body.message).toContain('about 220 m from Library');
    expect(await count('attempts')).toBe(0);
    const [[check]] = await ctx.pool.query('SELECT inside_radius FROM location_checks');
    expect(check.inside_radius).toBe(0);
  });

  it('test 4: accuracy worse than 50 m is ACCURACY_TOO_LOW, with no attempt and no location row', async () => {
    const { agent } = await ctx.login('poor');
    await consent(agent);
    const cp = await ctx.checkpointByName(agent, 'Library');
    const res = await ctx.verify(agent, cp, { accuracy: 51 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ACCURACY_TOO_LOW');
    expect(await count('attempts')).toBe(0);
    expect(await count('location_checks')).toBe(0);
    await ctx.verify(agent, cp, { accuracy: 50 }).expect(200);
  });

  it('test 5: a reading older than 30 s, or from the future, is STALE_POSITION and starts nothing', async () => {
    const { agent } = await ctx.login('stale');
    await consent(agent);
    const cp = await ctx.checkpointByName(agent, 'Library');
    for (const ageMs of [30_001, -1]) {
      const res = await ctx.verify(agent, cp, { ageMs });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('STALE_POSITION');
    }
    expect(await count('attempts')).toBe(0);
    expect(await count('location_checks')).toBe(0);
    expect((await ctx.verify(agent, cp, { ageMs: 30_000 })).body.status).toBe('OK');
  });

  it('rejects a reading that is not a valid position', async () => {
    const { agent } = await ctx.login('bad');
    await consent(agent);
    const cp = await ctx.checkpointByName(agent, 'Library');
    for (const body of [
      { lat: 91, lng: 9, accuracy: 5, ageMs: 0 },
      { lat: '49.1', lng: 9, accuracy: 5, ageMs: 0 },
      { lat: 49.1, lng: 9, accuracy: -1, ageMs: 0 },
      { lat: 49.1, lng: 9, accuracy: 5 },
    ]) {
      const res = await agent.post(`/api/checkpoints/${cp.id}/verify`).send(body);
      expect(res.status).toBe(400);
    }
    expect(await count('attempts')).toBe(0);
  });

  it('R-63 location needs the consent notice first', async () => {
    const { agent } = await ctx.login('noconsent');
    const cp = await ctx.checkpointByName(agent, 'Library');
    const res = await ctx.verify(agent, cp);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CONSENT_REQUIRED');
  });

  it('check 6 and 22: one Location_Check row with only yes/no and a time, no coordinates anywhere', async () => {
    const { agent } = await ctx.login('privacy');
    await ctx.startAttempt(agent, 'Library');
    const [rows] = await ctx.pool.query('SELECT * FROM location_checks');
    expect(rows).toHaveLength(1);
    expect(rows[0].inside_radius).toBe(1);
    const [columns] = await ctx.pool.query(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'location_checks'",
    );
    expect(
      columns.map((c) => c.name.toLowerCase()).filter((n) => /lat|lon|accur|coord|reason/.test(n)),
    ).toEqual([]);
  });

  it('test 10 BR12: leaving the circle after the unlock changes nothing; answers are still accepted', async () => {
    const { agent } = await ctx.login('wander');
    const attempt = await ctx.startAttempt(agent, 'Library');
    const cp = await ctx.checkpointByName(agent, 'Library');
    const away = await ctx.verify(agent, cp, { offset: 0.01, accuracy: 500, ageMs: 600_000 });
    expect(away.body).toMatchObject({ status: 'OK', resumed: true });
    expect(away.body.attempt.id).toBe(attempt.id);
    expect((await ctx.answer(agent, attempt, true)).status).toBe(200);
  });
});

describe('overlapping circles (Building C and Sensoricum)', () => {
  it('standing in Building C does not unlock the Sensoricum, and the other way round', async () => {
    const { agent } = await ctx.login('overlap');
    await consent(agent);
    const c = await ctx.checkpointByName(agent, 'Building C');
    const s = await ctx.checkpointByName(agent, 'Sensoricum');

    const atS = await ctx.verify(agent, s).expect(200);
    expect(atS.body.status).toBe('OK'); // at the Sensoricum centre: unlocks the Sensoricum
    await ctx.pool.query(
      "UPDATE attempts SET status = 'failed', end_reason = 'expired', finished_at = ? WHERE status = 'active'",
      [new Date(ctx.clock.now())],
    );

    const wrong = await agent
      .post(`/api/checkpoints/${s.id}/verify`)
      .send({ lat: c.latitude, lng: c.longitude, accuracy: 5, ageMs: 0 })
      .expect(200);
    expect(wrong.body).toMatchObject({ status: 'OUTSIDE', elsewhere: 'Building C' });
    expect(wrong.body.message).toContain('You are at Building C, not at Sensoricum');

    const reverse = await agent
      .post(`/api/checkpoints/${c.id}/verify`)
      .send({ lat: s.latitude, lng: s.longitude, accuracy: 5, ageMs: 0 })
      .expect(200);
    expect(reverse.body).toMatchObject({ status: 'OUTSIDE', elsewhere: 'Sensoricum' });
    expect(await count('attempts')).toBe(1);

    const right = await agent
      .post(`/api/checkpoints/${c.id}/verify`)
      .send({ lat: c.latitude, lng: c.longitude, accuracy: 5, ageMs: 0 })
      .expect(200);
    expect(right.body.status).toBe('OK');
  });

  it('a deactivated neighbour no longer takes the spot', async () => {
    const { agent } = await ctx.login('neighbour');
    await consent(agent);
    const c = await ctx.checkpointByName(agent, 'Building C');
    const s = await ctx.checkpointByName(agent, 'Sensoricum');
    await ctx.pool.query('UPDATE checkpoints SET is_active = 0 WHERE checkpoint_id = ?', [c.id]);
    const res = await agent
      .post(`/api/checkpoints/${s.id}/verify`)
      .send({ lat: c.latitude, lng: c.longitude, accuracy: 5, ageMs: 0 })
      .expect(200);
    expect(res.body.status).toBe('OK');
  });
});

describe('BR09 BR13 BR23 BR25 unlocking an attempt', () => {
  it('BR09 BR13 a 5-question checkpoint draws 5 distinct questions with 4 options and a 5-minute deadline', async () => {
    const { agent } = await ctx.login('draw');
    const attempt = await ctx.startAttempt(agent, 'Library');
    expect(attempt.questions).toHaveLength(5);
    expect(new Set(attempt.questions.map((q) => q.id)).size).toBe(5);
    expect(
      attempt.questions.every((q) => q.options.length === 4 && q.difficulty === 'NORMAL'),
    ).toBe(true);
    expect(Date.parse(attempt.expiresAt) - Date.parse(attempt.startTime)).toBe(5 * MINUTE);
    expect(attempt.questions.every((q) => q.correctOptionId === undefined)).toBe(true);
  });

  it('BR13 a 3-question checkpoint has a 3-minute deadline', async () => {
    const { agent } = await ctx.login('three');
    const attempt = await ctx.startAttempt(agent, 'Sensoricum');
    expect(attempt.questions).toHaveLength(3);
    expect(Date.parse(attempt.expiresAt) - Date.parse(attempt.startTime)).toBe(3 * MINUTE);
  });

  it('check 25: a bank that only just allows a draw still starts the quiz; one question fewer does not', async () => {
    const { agent } = await ctx.login('bank');
    const cafe = await ctx.checkpointByName(agent, 'CAS Cafe');
    const [ids] = await ctx.pool.query(
      'SELECT question_id FROM questions WHERE checkpoint_id = ? ORDER BY question_id',
      [cafe.id],
    );
    const keep = ids.slice(0, 3).map((r) => r.question_id);
    await ctx.pool.query(
      'UPDATE questions SET is_active = 0 WHERE checkpoint_id = ? AND question_id NOT IN (?)',
      [cafe.id, keep],
    );
    const attempt = await ctx.startAttempt(agent, 'CAS Cafe');
    expect(attempt.questions).toHaveLength(3);
    await ctx.answerPattern(agent, attempt, [true, true, true]);

    const other = await ctx.login('bank2');
    await ctx.pool.query('UPDATE questions SET is_active = 0 WHERE question_id = ?', [keep[0]]);
    await consent(other.agent);
    const res = await ctx.verify(other.agent, cafe);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DRAW_IMPOSSIBLE');
    const [[rows]] = await ctx.pool.query(
      'SELECT COUNT(*) AS n FROM location_checks WHERE student_id = ?',
      [other.student.id],
    );
    expect(rows.n).toBe(0); // the whole unlock was rolled back
  });

  it('BR10 a question without exactly one correct option of four is never drawn', async () => {
    const { agent } = await ctx.login('broken');
    const cafe = await ctx.checkpointByName(agent, 'CAS Cafe');
    const [ids] = await ctx.pool.query(
      'SELECT question_id FROM questions WHERE checkpoint_id = ? ORDER BY question_id',
      [cafe.id],
    );
    const keep = ids.slice(0, 4).map((r) => r.question_id);
    await ctx.pool.query(
      'UPDATE questions SET is_active = 0 WHERE checkpoint_id = ? AND question_id NOT IN (?)',
      [cafe.id, keep],
    );
    await ctx.pool.query('UPDATE options SET is_correct = 0 WHERE question_id = ?', [keep[0]]);
    try {
      const attempt = await ctx.startAttempt(agent, 'CAS Cafe');
      expect(attempt.questions.map((q) => q.id)).not.toContain(keep[0]);
    } finally {
      await ctx.pool.query(
        'UPDATE options SET is_correct = 1 WHERE question_id = ? AND option_text LIKE ?',
        [keep[0], '%placeholder answer%'],
      );
    }
  });

  it('test 7 check 15: two simultaneous taps give one attempt, and both get it back', async () => {
    const { agent } = await ctx.login('race');
    await consent(agent);
    const cp = await ctx.checkpointByName(agent, 'Library');
    const [a, b] = await Promise.all([ctx.verify(agent, cp), ctx.verify(agent, cp)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.attempt.id).toBe(b.body.attempt.id);
    expect(await count('attempts')).toBe(1);
  });

  it('test 7 check 23 BR25: after a new login the same attempt resumes, other checkpoints are refused', async () => {
    const first = await ctx.login('resume');
    const attempt = await ctx.startAttempt(first.agent, 'Library');
    const second = await ctx.login('resume');
    const { body } = await second.agent.get('/api/attempts/active').expect(200);
    expect(body.attempt.id).toBe(attempt.id);
    const library = await ctx.checkpointByName(second.agent, 'Library');
    const again = await ctx.verify(second.agent, library, { ageMs: 120_000 }).expect(200);
    expect(again.body.attempt.id).toBe(attempt.id);
    expect(again.body.attempt.questions.map((q) => q.id)).toEqual(
      attempt.questions.map((q) => q.id),
    );
    const mensa = await ctx.checkpointByName(second.agent, 'Mensa');
    const other = await ctx.verify(second.agent, mensa);
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('ACTIVE_ATTEMPT_EXISTS');
    expect(other.body.error.attemptId).toBe(attempt.id);
  });

  it('BR19 an expired attempt is closed and the next tap starts attempt number 2', async () => {
    const { agent } = await ctx.login('next');
    const first = await ctx.startAttempt(agent, 'Sensoricum');
    ctx.clock.advance(3 * MINUTE);
    const cp = await ctx.checkpointByName(agent, 'Sensoricum');
    const res = await ctx.verify(agent, cp).expect(200);
    expect(res.body.resumed).toBe(false);
    expect(res.body.attempt.id).not.toBe(first.id);
    expect(res.body.attempt.attemptNumber).toBe(2);
  });
});

describe('BR14 BR15 answers', () => {
  it('BR14 the right answer is revealed only after a wrong answer', async () => {
    const { agent } = await ctx.login('reveal');
    const attempt = await ctx.startAttempt(agent, 'Library');
    const right = await ctx.answer(agent, attempt, true);
    expect(right.body.correct).toBe(true);
    expect(right.body.correctOptionId).toBeUndefined();
    const wrong = await ctx.answer(agent, right.body.attempt, false);
    expect(wrong.body.correct).toBe(false);
    expect(wrong.body.attempt.questions[1].correctOptionId).toBe(wrong.body.correctOptionId);
    expect(wrong.body.attempt.questions[2].correctOptionId).toBeUndefined();
  });

  it('check 8: answering question 3 before question 2 is refused', async () => {
    const { agent } = await ctx.login('order');
    const attempt = await ctx.startAttempt(agent, 'Library');
    const optionId = await ctx.optionFor(attempt, true);
    const res = await agent
      .post(`/api/attempts/${attempt.id}/answers`)
      .send({ optionId, questionNumber: 3 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WRONG_QUESTION');
  });

  it('check 9 BR15: the same answer posted twice is refused and nothing changes (no retry)', async () => {
    const { agent } = await ctx.login('twice');
    const attempt = await ctx.startAttempt(agent, 'Library');
    const optionId = await ctx.optionFor(attempt, false);
    await agent
      .post(`/api/attempts/${attempt.id}/answers`)
      .send({ optionId, questionNumber: 1 })
      .expect(200);
    const replay = await agent
      .post(`/api/attempts/${attempt.id}/answers`)
      .send({ optionId, questionNumber: 1 });
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe('ALREADY_ANSWERED');
    const unnumbered = await agent.post(`/api/attempts/${attempt.id}/answers`).send({ optionId });
    expect(unnumbered.status).toBe(400);
    const { body } = await agent.get('/api/attempts/active').expect(200);
    expect(body.attempt.questions.filter((q) => q.answered)).toHaveLength(1);
  });

  it('BR22 another student cannot answer or read an attempt that is not theirs', async () => {
    const owner = await ctx.login('owner');
    const intruder = await ctx.login('intruder');
    const attempt = await ctx.startAttempt(owner.agent, 'Library');
    const optionId = await ctx.optionFor(attempt, true);
    const res = await intruder.agent.post(`/api/attempts/${attempt.id}/answers`).send({ optionId });
    expect(res.status).toBe(404);
    await intruder.agent.get(`/api/attempts/${attempt.id}`).expect(404);
  });

  it('check 12 BR25: a refresh in the middle of the quiz returns the same questions and answers', async () => {
    const { agent } = await ctx.login('refresh');
    const attempt = await ctx.startAttempt(agent, 'Library');
    const step = await ctx.answer(agent, attempt, true);
    const { body } = await agent.get('/api/attempts/active').expect(200);
    expect(body.attempt.questions.map((q) => q.id)).toEqual(attempt.questions.map((q) => q.id));
    expect(body.attempt.currentQuestion).toBe(2);
    expect(body.attempt.questions[0].selectedOptionId).toBe(
      step.body.attempt.questions[0].selectedOptionId,
    );
    expect(body.attempt.expiresAt).toBe(attempt.expiresAt);
  });
});

describe('BR22 server clock', () => {
  it('check 7: an answer at expires_at - 1 ms is accepted, at expires_at it is refused', async () => {
    const early = await ctx.login('early');
    const attempt = await ctx.startAttempt(early.agent, 'Library');
    ctx.clock.advance(5 * MINUTE - 1);
    const accepted = await ctx.answer(early.agent, attempt, true);
    expect(accepted.status).toBe(200);

    const late = await ctx.login('late');
    const lateAttempt = await ctx.startAttempt(late.agent, 'Mensa');
    ctx.clock.advance(5 * MINUTE);
    const refused = await ctx.answer(late.agent, lateAttempt, true);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('ATTEMPT_EXPIRED');
  });

  it('BR16 example 9: expiry with 1 of 3 correct fails with 0 points and the next attempt is number 3', async () => {
    const { agent } = await ctx.login('ex9');
    const first = await ctx.startAttempt(agent, 'Campus Garden');
    await ctx.answerPattern(agent, first, [false, false, false]);
    const second = await ctx.startAttempt(agent, 'Campus Garden');
    expect(second.attemptNumber).toBe(2);
    const step = await ctx.answer(agent, second, true);
    await ctx.answer(agent, step.body.attempt, false);
    ctx.clock.advance(3 * MINUTE);
    await ctx.services.quiz.finalizeAllExpired();
    const result = await agent.get(`/api/attempts/${second.id}/result`).expect(200);
    expect(result.body.result).toMatchObject({
      passed: false,
      pointsEarned: 0,
      status: 'failed',
      endReason: 'expired',
    });
    const third = await ctx.startAttempt(agent, 'Campus Garden');
    expect(third.attemptNumber).toBe(3);
  });

  it('BR16 example 8: 4 of 5 correct and then expiry still passes with 4000 points', async () => {
    const { agent } = await ctx.login('ex8');
    const attempt = await ctx.startAttempt(agent, 'Library');
    await ctx.answerPattern(agent, attempt, [true, true, true, true]);
    ctx.clock.advance(5 * MINUTE);
    const { body } = await agent.get('/api/attempts/active').expect(200);
    expect(body.attempt).toBeNull();
    const result = await agent.get(`/api/attempts/${attempt.id}/result`).expect(200);
    expect(result.body.result).toMatchObject({
      passed: true,
      pointsEarned: 4000,
      timeBonus: 0,
      fullClearBonus: 0,
    });
    const me = await agent.get('/api/me').expect(200);
    expect(me.body.student.totalPoints).toBe(4000);
  });
});

describe('BR17 BR18 BR19 BR20 BR21 scoring through the API', () => {
  it('BR18 example 1: all right, hard declined, 120 whole seconds left = 5320', async () => {
    const { agent } = await ctx.login('ex1');
    const attempt = await ctx.startAttempt(agent, 'Library');
    const step = await ctx.answerPattern(agent, attempt, [true, true, true, true]);
    expect(step.body.attempt.hardUnlocked).toBe(true);
    ctx.clock.advance(179_400);
    const last = await ctx.answer(agent, step.body.attempt, true);
    expect(last.body.result).toMatchObject({
      passed: true,
      pointsEarned: 5320,
      timeBonus: 120,
      fullClearBonus: 200,
      totalPoints: 5320,
    });
  });

  it('BR20 example 2: hard accepted and correct, 90 s left = 6290', async () => {
    const { agent } = await ctx.login('ex2');
    const attempt = await ctx.startAttempt(agent, 'Mensa');
    await ctx.answerPattern(agent, attempt, [true, true, true, true]);
    const hard = await agent.post(`/api/attempts/${attempt.id}/hard`).expect(200);
    expect(hard.body.attempt.questions[4].difficulty).toBe('HARD');
    ctx.clock.advance(209_500);
    const last = await ctx.answer(agent, hard.body.attempt, true);
    expect(last.body.result).toMatchObject({
      basePoints: 6000,
      timeBonus: 90,
      fullClearBonus: 200,
      pointsEarned: 6290,
    });
  });

  it('check 11 BR20 example 3: hard accepted and wrong still passes, with no full clear bonus', async () => {
    const { agent } = await ctx.login('ex3');
    const attempt = await ctx.startAttempt(agent, 'Building B');
    await ctx.answerPattern(agent, attempt, [true, true, true, true]);
    const hard = await agent.post(`/api/attempts/${attempt.id}/hard`).expect(200);
    const last = await ctx.answer(agent, hard.body.attempt, false);
    expect(last.body.result).toMatchObject({
      passed: true,
      basePoints: 4000,
      fullClearBonus: 0,
      correctCount: 4,
    });
  });

  it('check 10 BR20: the hard offer exists on attempt 1 of a large checkpoint only', async () => {
    const { agent } = await ctx.login('hardonce');
    const first = await ctx.startAttempt(agent, 'Library');
    await ctx.answerPattern(agent, first, [false, false, false, false, false]);
    const second = await ctx.startAttempt(agent, 'Library');
    const step = await ctx.answerPattern(agent, second, [true, true, true, true]);
    expect(step.body.attempt.hardUnlocked).toBe(false);
    const refused = await agent.post(`/api/attempts/${second.id}/hard`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('HARD_NOT_AVAILABLE');

    const small = await ctx.login('smallhard');
    const sensoricum = await ctx.startAttempt(small.agent, 'Sensoricum');
    const done = await ctx.answerPattern(small.agent, sensoricum, [true, true]);
    expect(done.body.attempt.hardUnlocked).toBe(false);
  });

  it('BR20 no hard offer when one of the first four answers was wrong', async () => {
    const { agent } = await ctx.login('nohard');
    const attempt = await ctx.startAttempt(agent, 'Library');
    const step = await ctx.answerPattern(agent, attempt, [true, false, true, true]);
    expect(step.body.attempt.hardUnlocked).toBe(false);
  });

  it('check 12 BR25: the hard question survives a refresh and cannot be taken twice', async () => {
    const { agent } = await ctx.login('hardrefresh');
    const attempt = await ctx.startAttempt(agent, 'Library');
    await ctx.answerPattern(agent, attempt, [true, true, true, true]);
    const hard = await agent.post(`/api/attempts/${attempt.id}/hard`).expect(200);
    const { body } = await agent.get('/api/attempts/active').expect(200);
    expect(body.attempt.hardAccepted).toBe(true);
    expect(body.attempt.questions[4].id).toBe(hard.body.attempt.questions[4].id);
    const again = await agent.post(`/api/attempts/${attempt.id}/hard`);
    expect(again.status).toBe(409);
  });

  it('BR19 example 5: the 85% multiplier of attempt 2 applies after bonuses', async () => {
    const { agent } = await ctx.login('ex5');
    const first = await ctx.startAttempt(agent, 'CAS Cafe');
    await ctx.answerPattern(agent, first, [false, false, false]);
    const second = await ctx.startAttempt(agent, 'CAS Cafe');
    ctx.clock.advance(119_500);
    const last = await ctx.answerPattern(agent, second, [true, true, true]);
    expect(last.body.result).toMatchObject({
      multiplierPercent: 85,
      timeBonus: 60,
      pointsEarned: 2771,
    });
  });

  it('check 13 BR21: a passed checkpoint is final and cannot be started again', async () => {
    const { agent } = await ctx.login('final');
    const attempt = await ctx.startAttempt(agent, 'Sensoricum');
    await ctx.answerPattern(agent, attempt, [true, true, true]);
    const cp = await ctx.checkpointByName(agent, 'Sensoricum');
    expect(cp.completed).toBe(true);
    const res = await ctx.verify(agent, cp);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_COMPLETED');
  });

  it('check 14 example 7: attempt 6 passes with 0 points, the checkpoint is completed and the total is unchanged', async () => {
    const { agent } = await ctx.login('six');
    for (let i = 1; i <= 5; i += 1) {
      const attempt = await ctx.startAttempt(agent, 'Sensoricum');
      expect(attempt.attemptNumber).toBe(i);
      await ctx.answerPattern(agent, attempt, [false, false, false]);
    }
    const sixth = await ctx.startAttempt(agent, 'Sensoricum');
    const last = await ctx.answerPattern(agent, sixth, [true, true, true]);
    expect(last.body.result).toMatchObject({
      passed: true,
      pointsEarned: 0,
      checkpointCompleted: true,
      totalPoints: 0,
    });
  });

  it('BR11 a changed table value changes the points without a code change', async () => {
    await ctx.pool.query('UPDATE difficulty SET points_awarded = 500 WHERE difficulty = ?', [
      'NORMAL',
    ]);
    await ctx.pool.query('UPDATE scoring_multiplier SET percentage = 50 WHERE attempt_number = 1');
    const { agent } = await ctx.login('tables');
    const attempt = await ctx.startAttempt(agent, 'Sensoricum');
    const last = await ctx.answerPattern(agent, attempt, [true, true, true]);
    // (3 x 500 + 180 time + 200 full clear) x 50% = 940
    expect(last.body.result).toMatchObject({
      basePoints: 1500,
      multiplierPercent: 50,
      pointsEarned: 940,
    });
  });

  it('BR16 every attempt is a new record and points are credited only when the attempt ends', async () => {
    const { agent } = await ctx.login('records');
    const attempt = await ctx.startAttempt(agent, 'Library');
    await ctx.answerPattern(agent, attempt, [true, true, true, true]);
    const during = await agent.get('/api/me').expect(200);
    expect(during.body.student.totalPoints).toBe(0);
    const [rows] = await ctx.pool.query('SELECT COUNT(*) AS n FROM attempts');
    expect(rows[0].n).toBe(1);
  });
});

describe('BR04 BR24 solo leaderboard', () => {
  it('check 20: equal scores share a rank and the earlier achiever is listed first', async () => {
    const early = await ctx.login('early1', { firstName: 'Early' });
    const later = await ctx.login('later1', { firstName: 'Later' });
    const low = await ctx.login('low1', { firstName: 'Low' });
    for (const who of [early, later]) {
      const attempt = await ctx.startAttempt(who.agent, 'Sensoricum');
      await ctx.answerPattern(who.agent, attempt, [true, true, false]);
      ctx.clock.advance(5 * SECOND);
    }
    const attempt = await ctx.startAttempt(low.agent, 'Sensoricum');
    ctx.clock.advance(100 * SECOND);
    await ctx.answerPattern(low.agent, attempt, [true, false, false]);
    const { body } = await low.agent.get('/api/leaderboards/solo').expect(200);
    expect(body.entries.map((e) => e.rank)).toEqual([1, 1, 3]);
    expect(body.entries.map((e) => e.displayName.split(' ')[0])).toEqual(['Early', 'Later', 'Low']);
    expect(body.you.rank).toBe(3);
  });
});

describe('read-first info, best score and rank (R-62, BR24)', () => {
  it('R-62 every checkpoint lists its read-first facts, and the best score of the student', async () => {
    const { agent } = await ctx.login('facts');
    const first = await ctx.startAttempt(agent, 'Sensoricum');
    await ctx.answerPattern(agent, first, [true, true, false]);
    const cp = await ctx.checkpointByName(agent, 'Sensoricum');
    expect(cp.facts).toHaveLength(3);
    expect(cp.facts[0]).toContain('PLACEHOLDER');
    expect(cp.bestScore).toBeGreaterThan(0);
    const mensa = await ctx.checkpointByName(agent, 'Mensa');
    expect(mensa.bestScore).toBe(0);
  });

  it('BR24 the result carries the rank before and after, and what the next attempt pays', async () => {
    const rival = await ctx.login('rival');
    const attempt0 = await ctx.startAttempt(rival.agent, 'Sensoricum');
    await ctx.answerPattern(rival.agent, attempt0, [true, true, true]);
    const { agent } = await ctx.login('climber');
    const attempt = await ctx.startAttempt(agent, 'Sensoricum');
    ctx.clock.advance(120_000);
    const last = await ctx.answerPattern(agent, attempt, [false, false, false]);
    expect(last.body.result).toMatchObject({
      passed: false,
      rankBefore: 2,
      rankAfter: 2,
      nextMultiplierPercent: 85,
    });
    const second = await ctx.startAttempt(agent, 'Sensoricum');
    const won = await ctx.answerPattern(agent, second, [true, true, true]);
    // Attempt 2 pays 85%, which is still less than the rival's full first attempt.
    expect(won.body.result).toMatchObject({ rankBefore: 2, rankAfter: 2 });
    const me = await agent.get('/api/me').expect(200);
    expect(me.body.student.rank).toBe(won.body.result.rankAfter);
  });
});
