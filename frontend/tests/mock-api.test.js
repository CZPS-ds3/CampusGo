import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockApi } from '../src/api/mock.js';
import questionBank from '../src/api/question-bank.json';

class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const LIBRARY = { latitude: 49.149493, longitude: 9.216467, ageMs: 0 };
let api;

async function signIn() {
  await api.verify({
    email: 'ada@heilbronn.dhbw.de',
    otp: '123456',
    firstName: 'Ada',
    lastName: 'Lovelace',
  });
  await api.consent();
}

const COUNTDOWN_MS = 3000;
const BANK = Object.values(questionBank.bank).flat();

/** Unlocks the Library and waits out the 3-2-1 countdown (R-66), after which the questions are sent. */
async function startLibrary() {
  const { attempt } = await api.verifyLocation(2, { ...LIBRARY, accuracy: 10 });
  vi.setSystemTime(Date.now() + COUNTDOWN_MS);
  return (await api.attempt(attempt.id)).attempt;
}

/** Option ids of the current question that the team's bank marks right (`wanted` true) or wrong. */
const optionIds = (attempt, wanted) => {
  const question = attempt.questions.find((q) => q.number === attempt.currentQuestion);
  const source = BANK.find(
    (b) => b.text === question.text && b.options.every((o, i) => o === question.options[i].text),
  );
  return question.options.filter((_, i) => source.right.includes(i) === wanted).map((o) => o.id);
};
/** All right options (one, or two or three for a multi-select question). */
const right = (attempt) => optionIds(attempt, true);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  sessionStorage.clear();
  api = createMockApi(ApiError, () => () => {});
});
afterEach(() => vi.useRealTimers());

describe('mock API keeps the same rules as the server (BR12, BR13, BR14, BR18)', () => {
  it('BR02 a school address is required', async () => {
    await expect(api.requestOtp('ada@gmail.com')).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
    // BR26: the pre-seeded admin addresses may be outside the school domain.
    await expect(api.requestOtp('dhbw.campusgo@gmail.com')).resolves.toBeDefined();
    await expect(api.requestOtp('ada@heilbronn.dhbw.de')).resolves.toMatchObject({
      message: 'If the account exists, an email containing the OTP has been sent.',
    });
  });

  it('BR12 poor accuracy or an old reading starts nothing', async () => {
    await signIn();
    await expect(api.verifyLocation(2, { ...LIBRARY, accuracy: 201 })).rejects.toMatchObject({
      code: 'ACCURACY_TOO_LOW',
    });
    await expect(
      api.verifyLocation(2, { ...LIBRARY, accuracy: 5, ageMs: 30_001 }),
    ).rejects.toMatchObject({ code: 'STALE_POSITION' });
    expect((await api.activeAttempt()).attempt).toBeNull();
  });

  it('BR12 outside the circle reports a rounded distance; inside unlocks, a second tap resumes', async () => {
    await signIn();
    const far = await api.verifyLocation(2, { ...LIBRARY, latitude: 49.151493, accuracy: 5 });
    expect(far).toMatchObject({ status: 'OUTSIDE', distanceM: 220 });
    const first = await api.verifyLocation(2, { ...LIBRARY, accuracy: 5 });
    const again = await api.verifyLocation(2, { ...LIBRARY, accuracy: 5 });
    expect(first.status).toBe('OK');
    expect(again).toMatchObject({ status: 'OK', resumed: true });
    expect(again.attempt.id).toBe(first.attempt.id);
  });

  it('BR12 standing in Building C does not unlock the Sensoricum, and the other way round', async () => {
    await signIn();
    const c = { latitude: 49.147316, longitude: 9.2179, accuracy: 5, ageMs: 0 };
    const s = { latitude: 49.14762, longitude: 9.217807, accuracy: 5, ageMs: 0 };
    const wrong = await api.verifyLocation(8, c);
    expect(wrong).toMatchObject({ status: 'OUTSIDE', elsewhere: 'Building C' });
    expect((await api.activeAttempt()).attempt).toBeNull();
    const reverse = await api.verifyLocation(7, s);
    expect(reverse).toMatchObject({ status: 'OUTSIDE', elsewhere: 'Sensoricum' });
    expect((await api.verifyLocation(8, s)).status).toBe('OK');
  });

  it('BR07 BR08 all eight pilot checkpoints are listed; an unknown one cannot be started', async () => {
    await signIn();
    const { checkpoints } = await api.checkpoints();
    expect(checkpoints).toHaveLength(8);
    await expect(api.verifyLocation(99, { ...LIBRARY, accuracy: 5 })).rejects.toMatchObject({
      code: 'NOT_AVAILABLE',
    });
  });

  it('BR12 a location check needs the consent notice first', async () => {
    await api.verify({
      email: 'ada@heilbronn.dhbw.de',
      otp: '123456',
      firstName: 'Ada',
      lastName: 'L',
    });
    await expect(api.verifyLocation(2, { ...LIBRARY, accuracy: 5 })).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED',
    });
  });

  it('BR13 a 5-question checkpoint gets 5 distinct questions with 4 options each', async () => {
    await signIn();
    const attempt = await startLibrary();
    expect(attempt.questions).toHaveLength(5);
    expect(new Set(attempt.questions.map((q) => q.id)).size).toBe(5);
    expect(attempt.questions.every((q) => q.options.length === 4)).toBe(true);
  });

  it('BR14 the right answer is shown only after a wrong answer', async () => {
    await signIn();
    const attempt = await startLibrary();
    const [wrongId] = optionIds(attempt, false);
    const res = await api.answer(attempt.id, wrongId);
    expect(res.correct).toBe(false);
    expect(res.attempt.questions[0].correctOptionId).toBeDefined();
    expect(res.attempt.questions[1].correctOptionId).toBeUndefined();
  });

  it('BR18 BR19 a full clear on attempt 1 earns base + time + 200 at 100%', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'));
    await signIn();
    let attempt = await startLibrary();
    // One minute after the quiz started (it starts 3 s after the unlock, R-66): 240 of 300 seconds left.
    vi.setSystemTime(new Date('2026-11-02T12:01:03Z'));
    let res;
    for (let i = 0; i < 5; i += 1) {
      res = await api.answer(attempt.id, right(attempt));
      attempt = res.attempt;
    }
    vi.useRealTimers();
    expect(res.result).toMatchObject({
      passed: true,
      basePoints: 5000,
      fullClearBonus: 200,
      timeBonus: 240,
      pointsEarned: 5440,
    });
  });

  it('BR21 a passed checkpoint is final', async () => {
    await signIn();
    let attempt = await startLibrary();
    for (let i = 0; i < 5; i += 1) attempt = (await api.answer(attempt.id, right(attempt))).attempt;
    await expect(api.verifyLocation(2, { ...LIBRARY, accuracy: 5 })).rejects.toMatchObject({
      code: 'ALREADY_COMPLETED',
    });
  });

  it('BR06 the team leaderboard is closed to students without a team', async () => {
    await signIn();
    await expect(api.teamBoard()).rejects.toMatchObject({ code: 'NO_TEAM' });
  });

  it('calls without a session end in UNAUTHENTICATED', async () => {
    await expect(api.checkpoints()).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });
});

describe('R-66 the 3-2-1 countdown before the first question (mock, like the server)', () => {
  it('R-66 BR13 during the countdown no question is sent and no answer is taken; the quiz time starts after it', async () => {
    await signIn();
    const unlockedAt = Date.now();
    const { attempt } = await api.verifyLocation(2, { ...LIBRARY, accuracy: 10 });
    expect(attempt.questions).toEqual([]);
    expect(Date.parse(attempt.startTime) - unlockedAt).toBe(COUNTDOWN_MS);
    expect(attempt.timeLimitSeconds).toBe(300);
    await expect(api.answer(attempt.id, [attempt.id * 10])).rejects.toMatchObject({
      code: 'QUIZ_NOT_STARTED',
    });
    vi.setSystemTime(unlockedAt + COUNTDOWN_MS);
    const started = (await api.attempt(attempt.id)).attempt;
    expect(started.questions).toHaveLength(5);
    expect(Date.parse(started.expiresAt) - Date.now()).toBe(300_000);
  });
});

describe("BR09 BR50 the mock serves the team's question bank, not placeholders", () => {
  it('BR09 every quest holds all bank questions with their facts and description', async () => {
    await signIn();
    const { checkpoints } = await api.checkpoints();
    for (const checkpoint of checkpoints) {
      const info = questionBank.info[checkpoint.name];
      expect(checkpoint.description).toBe(info.description);
      expect(checkpoint.facts).toEqual(info.facts);
      expect(JSON.stringify(checkpoint)).not.toMatch(/PLACEHOLDER|placeholder answer/);
    }
  });

  it('BR50 Library and Building B are mixed, so their multi-select questions are drawn', async () => {
    await signIn();
    const { checkpoints } = await api.checkpoints();
    const mixed = checkpoints.filter((c) => c.typeMode === 'MIXED').map((c) => c.name);
    expect(mixed.sort()).toEqual(['Building B', 'Library']);
    const attempt = await startLibrary();
    expect(attempt.questions.filter((q) => q.type === 'MULTI')).toHaveLength(1);
  });
});
