import { describe, expect, it } from 'vitest';
import {
  assignRanks,
  ceilDiv,
  remainingWholeSeconds,
  scoreAttempt,
  teamScore,
  totalFromExact,
} from '../src/services/scoring.js';

const rules = {
  normal: 1000,
  hard: 2000,
  timePerSecond: 1,
  fullClear: 200,
  multipliers: new Map([
    [1, 100],
    [2, 85],
    [3, 70],
    [4, 55],
    [5, 40],
    [6, 0],
  ]),
};
const N = (correct) => ({ difficulty: 'NORMAL', correct });
const H = (correct) => ({ difficulty: 'HARD', correct });
const run = (input) => scoreAttempt({ rules, ...input });

describe('BR14 BR16 BR17 BR18 BR19 BR21 worked examples (section 3.3)', () => {
  it('example 1: Library attempt 1, hard declined, 120 s left = 5320', () => {
    const r = run({
      slots: [N(true), N(true), N(true), N(true), N(true)],
      questionCount: 5,
      passThreshold: 4,
      attemptNumber: 1,
      remainingSeconds: 120,
    });
    expect(r.pointsEarned).toBe(5320);
    expect(r.fullClearBonus).toBe(200);
  });
  it('example 2: Mensa attempt 1, hard accepted and correct, 90 s left = 6290', () => {
    const r = run({
      slots: [N(true), N(true), N(true), N(true), H(true)],
      questionCount: 5,
      passThreshold: 4,
      attemptNumber: 1,
      remainingSeconds: 90,
    });
    expect(r.pointsEarned).toBe(6290);
  });
  it('example 3: hard accepted and wrong, 150 s left = 4150, no full clear', () => {
    const r = run({
      slots: [N(true), N(true), N(true), N(true), H(false)],
      questionCount: 5,
      passThreshold: 4,
      attemptNumber: 1,
      remainingSeconds: 150,
    });
    expect(r.pointsEarned).toBe(4150);
    expect(r.fullClearBonus).toBe(0);
  });
  it('example 4: Sensoricum 2 of 3, 100 s left = 2100', () => {
    const r = run({
      slots: [N(true), N(true), N(false)],
      questionCount: 3,
      passThreshold: 2,
      attemptNumber: 1,
      remainingSeconds: 100,
    });
    expect(r.pointsEarned).toBe(2100);
    expect(r.passed).toBe(true);
  });
  it('example 5: attempt 2 multiplier applies after bonuses = 2771 (not 2810)', () => {
    const r = run({
      slots: [N(true), N(true), N(true)],
      questionCount: 3,
      passThreshold: 2,
      attemptNumber: 2,
      remainingSeconds: 60,
    });
    expect(r.pointsEarned).toBe(2771);
  });
  it('example 6: attempt 5 at 40% = 1618', () => {
    const r = run({
      slots: [N(true), N(true), N(true), N(true), N(false)],
      questionCount: 5,
      passThreshold: 4,
      attemptNumber: 5,
      remainingSeconds: 45,
    });
    expect(r.pointsEarned).toBe(1618);
  });
  it('example 7: attempt 6 passes but earns 0', () => {
    const r = run({
      slots: [N(true), N(true), N(true), N(true), N(true)],
      questionCount: 5,
      passThreshold: 4,
      attemptNumber: 6,
      remainingSeconds: 200,
    });
    expect(r.passed).toBe(true);
    expect(r.pointsEarned).toBe(0);
  });
  it('example 8: question 5 unanswered at expiry still passes 4/5 = 2800', () => {
    const r = run({
      slots: [N(true), N(true), N(true), N(true), N(false)],
      questionCount: 5,
      passThreshold: 4,
      attemptNumber: 3,
      remainingSeconds: 0,
    });
    expect(r.pointsEarned).toBe(2800);
  });
  it('example 9: 1 of 3 correct fails and earns 0', () => {
    const r = run({
      slots: [N(true), N(false), N(false)],
      questionCount: 3,
      passThreshold: 2,
      attemptNumber: 2,
      remainingSeconds: 0,
    });
    expect(r.passed).toBe(false);
    expect(r.pointsEarned).toBe(0);
  });
  it('example 10: fraction is rounded up, 3431.45 becomes 3432', () => {
    const r = run({
      slots: [N(true), N(true), N(true), N(true), N(false)],
      questionCount: 5,
      passThreshold: 4,
      attemptNumber: 2,
      remainingSeconds: 37,
    });
    expect(r.pointsExact).toBe(343145);
    expect(r.pointsEarned).toBe(3432);
  });
  it('example 11: hard accepted but unanswered at expiry = 4000, passed', () => {
    const r = run({
      slots: [N(true), N(true), N(true), N(true), H(false)],
      questionCount: 5,
      passThreshold: 4,
      attemptNumber: 1,
      remainingSeconds: 0,
    });
    expect(r.passed).toBe(true);
    expect(r.pointsEarned).toBe(4000);
  });
});

describe('BR04 BR05 BR24 team and ranking examples', () => {
  it('example 12: team of three with 5320, 4452, 0 = 3258', () => {
    expect(teamScore([5320, 4452, 0])).toBe(3258);
  });
  it('example 13: team of two with 5001 and 5000 = 5001', () => {
    expect(teamScore([5001, 5000])).toBe(5001);
  });
  it('example 14: equal scores share a rank (1, 1, 3), listed in the given order', () => {
    const ranked = assignRanks([{ points: 5320 }, { points: 5320 }, { points: 4000 }]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });
  it('example 15 and check 24: rounding once per user gives 5187, not 5188', () => {
    const library = run({
      slots: [N(true), N(true), N(true), N(true), N(false)],
      questionCount: 5,
      passThreshold: 4,
      attemptNumber: 2,
      remainingSeconds: 37,
    });
    const garden = run({
      slots: [N(true), N(true), N(false)],
      questionCount: 3,
      passThreshold: 2,
      attemptNumber: 2,
      remainingSeconds: 65,
    });
    expect(library.pointsEarned + garden.pointsEarned).toBe(3432 + 1756);
    expect(library.pointsExact + garden.pointsExact).toBe(518670);
    expect(totalFromExact(library.pointsExact + garden.pointsExact)).toBe(5187);
  });
});

describe('R-02 R-03 integer helpers', () => {
  it('R-03 whole seconds are floored and never negative', () => {
    expect(remainingWholeSeconds(300_000, 179_400)).toBe(120);
    expect(remainingWholeSeconds(1_000, 5_000)).toBe(0);
  });
  it('R-02 ceilDiv rounds up without floating point', () => {
    expect(ceilDiv(10001, 2)).toBe(5001);
    expect(ceilDiv(10000, 2)).toBe(5000);
  });
  it('BR11 a different table value changes the result (values are not hard-coded)', () => {
    const doubled = { ...rules, normal: 2000 };
    const r = scoreAttempt({
      rules: doubled,
      slots: [N(true), N(true), N(false)],
      questionCount: 3,
      passThreshold: 2,
      attemptNumber: 1,
      remainingSeconds: 0,
    });
    expect(r.pointsEarned).toBe(4000);
  });
});
