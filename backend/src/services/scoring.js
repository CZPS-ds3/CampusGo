// Pure scoring rules (BR14, BR16-BR21, BR04). No database, no clock: easy to test.
// All point values come from the database tables (BR11) and are passed in as `rules`.
// All arithmetic is integer arithmetic (R-02): exact points are kept in hundredths of a point.

/**
 * @typedef {{ normal: number, hard: number, timePerSecond: number, fullClear: number,
 *   multipliers: Map<number, number> }} ScoringRules
 */

/** ceil(a / b) for non-negative integers, without floating point. */
export const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);

/** Multiplier percent for an attempt number; numbers above the highest row use the highest row (R-18). */
export function multiplierFor(multipliers, attemptNumber) {
  if (multipliers.has(attemptNumber)) return multipliers.get(attemptNumber);
  const highest = Math.max(...multipliers.keys());
  return multipliers.get(Math.min(attemptNumber, highest));
}

/** Whole seconds left: floor((expiresAt - finishedAt) / 1000), never below 0 (R-03). */
export function remainingWholeSeconds(expiresAtMs, finishedAtMs) {
  return Math.max(0, Math.floor((expiresAtMs - finishedAtMs) / 1000));
}

/**
 * Score one finished attempt (R-01).
 * @param {object} input
 * @param {{ difficulty: 'NORMAL'|'HARD', correct: boolean }[]} input.slots every presented question slot
 * @param {number} input.questionCount 3 or 5
 * @param {number} input.passThreshold correct answers needed to pass (4 of 5, 2 of 3)
 * @param {number} input.attemptNumber
 * @param {number} input.remainingSeconds whole seconds left (0 after expiry)
 * @param {ScoringRules} input.rules
 */
export function scoreAttempt({
  slots,
  questionCount,
  passThreshold,
  attemptNumber,
  remainingSeconds,
  rules,
}) {
  const correctCount = slots.filter((slot) => slot.correct).length;
  const passed = correctCount >= passThreshold;
  const multiplierPercent = multiplierFor(rules.multipliers, attemptNumber);

  if (!passed) {
    return {
      passed,
      correctCount,
      basePoints: 0,
      timeBonus: 0,
      fullClearBonus: 0,
      multiplierPercent,
      pointsExact: 0,
      pointsEarned: 0,
    };
  }

  const basePoints = slots.reduce(
    (sum, slot) =>
      slot.correct ? sum + (slot.difficulty === 'HARD' ? rules.hard : rules.normal) : sum,
    0,
  );
  const timeBonus = remainingSeconds * rules.timePerSecond;
  const everySlotCorrect = slots.length === questionCount && correctCount === questionCount;
  const fullClearBonus = everySlotCorrect ? rules.fullClear : 0;
  const rawPoints = basePoints + timeBonus + fullClearBonus;
  const pointsExact = rawPoints * multiplierPercent; // hundredths of a point
  return {
    passed,
    correctCount,
    basePoints,
    timeBonus,
    fullClearBonus,
    multiplierPercent,
    pointsExact,
    pointsEarned: ceilDiv(pointsExact, 100),
  };
}

/** User total: BR04 rounding is applied once, on the exact sum (R-02). */
export const totalFromExact = (pointsExactX100) => ceilDiv(pointsExactX100, 100);

/** Team score: ceil(average of the members' integer totals) (R-50). */
export function teamScore(memberTotals) {
  if (memberTotals.length === 0) return 0;
  const sum = memberTotals.reduce((a, b) => a + b, 0);
  return ceilDiv(sum, memberTotals.length);
}

/** Competition ranking: rank = 1 + number of strictly higher scores (R-52). Entries must be sorted already. */
export function assignRanks(entries) {
  return entries.map((entry) => ({
    ...entry,
    rank: 1 + entries.filter((other) => other.points > entry.points).length,
  }));
}
