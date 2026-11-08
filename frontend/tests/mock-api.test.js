import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockApi } from '../src/api/mock.js';

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

async function startLibrary() {
  return (await api.verifyLocation(2, { ...LIBRARY, accuracy: 10 })).attempt;
}

/** The mock marks the right option in its text, so a test can answer without knowing internals. */
const right = (attempt) => {
  const question = attempt.questions.find((q) => q.number === attempt.currentQuestion);
  return question.options.find((o) => o.text.includes('placeholder answer')).id;
};

beforeEach(() => {
  sessionStorage.clear();
  api = createMockApi(ApiError, () => () => {});
});

describe('mock API keeps the same rules as the server (BR12, BR13, BR14, BR18)', () => {
  it('BR02 a school address is required', async () => {
    await expect(api.requestOtp('ada@gmail.com')).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
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
    const wrongId = attempt.questions[0].options.find(
      (o) => !o.text.includes('placeholder answer'),
    ).id;
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
    vi.setSystemTime(new Date('2026-11-02T12:01:00Z'));
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
