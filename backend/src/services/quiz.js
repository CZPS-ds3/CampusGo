// Checkpoints, location check, attempts, answers and scoring (BR07-BR25).
// The server decides time, state and points. Constants come from the database tables (BR11).
import { at } from '../clock.js';
import { withTransaction } from '../db/pool.js';
import { AppError, notFound } from '../middleware/errors.js';
import { evaluateLocation } from './geo.js';
import { ceilDiv, multiplierFor, remainingWholeSeconds, scoreAttempt } from './scoring.js';
import { refreshTeamScore } from './teams.js';

const SECONDS_PER_QUESTION = 60; // BR13

export function createQuizService({ pool, config, clock }) {
  // ---------- reference data ----------
  async function loadRules(conn) {
    const [difficulty] = await conn.query('SELECT difficulty, points_awarded FROM difficulty');
    const [bonus] = await conn.query('SELECT bonus_type, points_awarded FROM bonus');
    const [multipliers] = await conn.query(
      'SELECT attempt_number, percentage FROM scoring_multiplier',
    );
    const diff = Object.fromEntries(difficulty.map((d) => [d.difficulty, d.points_awarded]));
    const bon = Object.fromEntries(bonus.map((b) => [b.bonus_type, b.points_awarded]));
    return {
      normal: diff.NORMAL,
      hard: diff.HARD,
      timePerSecond: bon.TIME,
      fullClear: bon.FULL_CLEAR,
      multipliers: new Map(multipliers.map((m) => [m.attempt_number, m.percentage])),
    };
  }

  const mapCheckpoint = (c, extra = {}) => ({
    id: c.checkpoint_id,
    name: c.checkpoint_name,
    latitude: Number(c.latitude),
    longitude: Number(c.longitude),
    radius: c.radius,
    isActive: Boolean(c.is_active),
    questionCount: c.question_count,
    passThreshold: c.pass_threshold,
    hardQuestionEnabled: Boolean(c.hard_question_enabled),
    ...extra,
  });

  async function listCheckpoints(studentId) {
    const [rows] = await pool.query('SELECT * FROM checkpoints ORDER BY checkpoint_id');
    const [stats] = await pool.query(
      `SELECT checkpoint_id, COUNT(*) AS used, SUM(status = 'passed') AS passed
       FROM attempts WHERE student_id = ? GROUP BY checkpoint_id`,
      [studentId],
    );
    const byId = new Map(stats.map((s) => [s.checkpoint_id, s]));
    const [best] = await pool.query(
      'SELECT checkpoint_id, MAX(points_earned) AS best FROM attempts WHERE student_id = ? GROUP BY checkpoint_id',
      [studentId],
    );
    const bestById = new Map(best.map((b) => [b.checkpoint_id, Number(b.best)]));
    const [factRows] = await pool.query(
      'SELECT checkpoint_id, fact_text FROM checkpoint_facts ORDER BY checkpoint_id, position',
    );
    const facts = new Map();
    for (const f of factRows)
      facts.set(f.checkpoint_id, [...(facts.get(f.checkpoint_id) ?? []), f.fact_text]);
    return rows.map((c) => {
      const s = byId.get(c.checkpoint_id);
      const used = Number(s?.used ?? 0);
      return mapCheckpoint(c, {
        completed: Number(s?.passed ?? 0) > 0,
        attemptsUsed: used,
        nextAttemptNumber: used + 1,
        bestScore: bestById.get(c.checkpoint_id) ?? 0,
        facts: facts.get(c.checkpoint_id) ?? [],
      });
    });
  }

  // ---------- attempt view (what the client may see) ----------
  async function buildAttemptView(conn, attemptId) {
    const [[attempt]] = await conn.query(
      `SELECT a.*, c.checkpoint_name, c.question_count, c.pass_threshold FROM attempts a
       JOIN checkpoints c ON c.checkpoint_id = a.checkpoint_id WHERE a.attempt_id = ?`,
      [attemptId],
    );
    const [slots] = await conn.query(
      `SELECT aq.question_number, aq.question_id, aq.replaced_question_id, aq.selected_option_id, aq.answered_at,
              q.question_text, q.difficulty
       FROM attempt_questions aq JOIN questions q ON q.question_id = aq.question_id
       WHERE aq.attempt_id = ? ORDER BY aq.question_number`,
      [attemptId],
    );
    const questionIds = slots.map((s) => s.question_id);
    const [options] = questionIds.length
      ? await conn.query(
          'SELECT option_id, question_id, option_position, option_text, is_correct FROM options WHERE question_id IN (?) ORDER BY question_id, option_position',
          [questionIds],
        )
      : [[]];
    const byQuestion = new Map();
    for (const o of options) {
      if (!byQuestion.has(o.question_id)) byQuestion.set(o.question_id, []);
      byQuestion.get(o.question_id).push(o);
    }
    const questions = slots.map((s) => {
      const opts = byQuestion.get(s.question_id) ?? [];
      const answered = s.selected_option_id !== null;
      const selected = opts.find((o) => o.option_id === s.selected_option_id);
      const wrong = answered && !selected?.is_correct;
      const view = {
        number: s.question_number,
        id: s.question_id,
        text: s.question_text,
        difficulty: s.difficulty,
        options: opts.map((o) => ({
          id: o.option_id,
          position: o.option_position,
          text: o.option_text,
        })),
        selectedOptionId: s.selected_option_id,
        answered,
      };
      // BR14: the right answer is revealed only after a wrong pick. Never before the answer.
      if (wrong) view.correctOptionId = opts.find((o) => o.is_correct)?.option_id ?? null;
      if (answered) view.correct = !wrong;
      return view;
    });
    const next = slots.find((s) => s.selected_option_id === null);
    const rules = await loadRules(conn);
    const slot5 = slots.find((s) => s.question_number === 5);
    return {
      id: attempt.attempt_id,
      checkpointId: attempt.checkpoint_id,
      checkpointName: attempt.checkpoint_name,
      attemptNumber: attempt.attempt_number,
      multiplierPercent: multiplierFor(rules.multipliers, attempt.attempt_number),
      status: attempt.status,
      endReason: attempt.end_reason,
      startTime: attempt.start_time.toISOString(),
      expiresAt: attempt.expires_at.toISOString(),
      serverNow: new Date(clock.now()).toISOString(),
      questionCount: attempt.question_count,
      passThreshold: attempt.pass_threshold,
      hardUnlocked: Boolean(attempt.hard_unlocked),
      hardAccepted: Boolean(slot5?.replaced_question_id),
      currentQuestion: attempt.status === 'active' && next ? next.question_number : null,
      questions,
    };
  }

  // ---------- finishing an attempt ----------
  /** Scores and closes an attempt inside the caller's transaction (R-08, R-22). Student row must be locked. */
  async function finalizeAttempt(conn, attempt, endReason, nowMs) {
    const rules = await loadRules(conn);
    const [slots] = await conn.query(
      `SELECT q.difficulty, COALESCE(o.is_correct, 0) AS correct
       FROM attempt_questions aq
       JOIN questions q ON q.question_id = aq.question_id
       LEFT JOIN options o ON o.option_id = aq.selected_option_id
       WHERE aq.attempt_id = ? ORDER BY aq.question_number`,
      [attempt.attempt_id],
    );
    const [[checkpoint]] = await conn.query(
      'SELECT question_count, pass_threshold FROM checkpoints WHERE checkpoint_id = ?',
      [attempt.checkpoint_id],
    );
    const finishedMs = endReason === 'expired' ? attempt.expires_at.getTime() : nowMs;
    const score = scoreAttempt({
      slots: slots.map((s) => ({ difficulty: s.difficulty, correct: Boolean(s.correct) })),
      questionCount: checkpoint.question_count,
      passThreshold: checkpoint.pass_threshold,
      attemptNumber: attempt.attempt_number,
      remainingSeconds:
        endReason === 'expired'
          ? 0
          : remainingWholeSeconds(attempt.expires_at.getTime(), finishedMs),
      rules,
    });
    await conn.query(
      `UPDATE attempts SET status = ?, end_reason = ?, finished_at = ?, correct_count = ?, base_points = ?, time_bonus = ?,
         full_clear_bonus = ?, multiplier_percent = ?, points_exact = ?, points_earned = ? WHERE attempt_id = ?`,
      [
        score.passed ? 'passed' : 'failed',
        endReason,
        at(finishedMs),
        score.correctCount,
        score.basePoints,
        score.timeBonus,
        score.fullClearBonus,
        score.multiplierPercent,
        score.pointsExact,
        score.pointsEarned,
        attempt.attempt_id,
      ],
    );
    if (score.pointsExact > 0) {
      // BR16: points are credited only now, once, together with closing the attempt.
      const [[student]] = await conn.query(
        'SELECT points_exact_x100, team_id FROM students WHERE student_id = ?',
        [attempt.student_id],
      );
      const exact = Number(student.points_exact_x100) + score.pointsExact;
      await conn.query(
        'UPDATE students SET points_exact_x100 = ?, total_points = ?, points_updated_at = ? WHERE student_id = ?',
        [exact, ceilDiv(exact, 100), at(finishedMs), attempt.student_id],
      );
      if (student.team_id) await refreshTeamScore(conn, student.team_id, finishedMs);
    }
    return score;
  }

  /** Closes an attempt as expired if its deadline has passed (BR16, BR22). Safe to call any time. */
  async function finalizeIfExpired(attemptId) {
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const [[found]] = await conn.query('SELECT student_id FROM attempts WHERE attempt_id = ?', [
        attemptId,
      ]);
      if (!found) return;
      await conn.query('SELECT student_id FROM students WHERE student_id = ? FOR UPDATE', [
        found.student_id,
      ]);
      const [[attempt]] = await conn.query(
        'SELECT * FROM attempts WHERE attempt_id = ? FOR UPDATE',
        [attemptId],
      );
      if (attempt.status === 'active' && now >= attempt.expires_at.getTime()) {
        await finalizeAttempt(conn, attempt, 'expired', now);
      }
    });
  }

  async function finalizeExpiredFor(studentId) {
    const [rows] = await pool.query(
      "SELECT attempt_id FROM attempts WHERE student_id = ? AND status = 'active'",
      [studentId],
    );
    for (const row of rows) await finalizeIfExpired(row.attempt_id);
  }

  /** Background job: closes every overdue attempt. */
  async function finalizeAllExpired() {
    const [rows] = await pool.query(
      "SELECT attempt_id FROM attempts WHERE status = 'active' AND expires_at <= ?",
      [at(clock.now())],
    );
    for (const row of rows) await finalizeIfExpired(row.attempt_id);
    return rows.length;
  }

  // ---------- location check (BR12, R-60 .. R-65) ----------
  async function checkGuards(studentId, checkpointId) {
    const [[checkpoint]] = await pool.query('SELECT * FROM checkpoints WHERE checkpoint_id = ?', [
      checkpointId,
    ]);
    if (!checkpoint) throw notFound('Checkpoint not found.');
    if (!checkpoint.is_active)
      throw new AppError(409, 'CHECKPOINT_INACTIVE', 'This checkpoint is not active right now.');
    const [[passed]] = await pool.query(
      "SELECT attempt_id FROM attempts WHERE student_id = ? AND checkpoint_id = ? AND status = 'passed'",
      [studentId, checkpointId],
    );
    if (passed)
      throw new AppError(409, 'CHECKPOINT_COMPLETED', 'You already completed this checkpoint.');
    await finalizeExpiredFor(studentId);
    const [[active]] = await pool.query(
      "SELECT attempt_id FROM attempts WHERE student_id = ? AND status = 'active'",
      [studentId],
    );
    if (active)
      throw new AppError(409, 'ACTIVE_ATTEMPT_EXISTS', 'You have a quiz in progress.', {
        attemptId: active.attempt_id,
      });
    return checkpoint;
  }

  async function locationCheck(studentId, checkpointId, sample) {
    const checkpoint = await checkGuards(studentId, checkpointId);
    const [[student]] = await pool.query(
      'SELECT location_consent_at FROM students WHERE student_id = ?',
      [studentId],
    );
    if (!student.location_consent_at)
      throw new AppError(403, 'CONSENT_REQUIRED', 'Please accept the location notice first.');
    const outcome = evaluateLocation(sample, checkpoint, config.maxAccuracyM);
    if (outcome !== 'poor_accuracy') {
      // Only "inside radius yes/no" and the time are stored. The coordinates are discarded here (R-63).
      await pool.query(
        'INSERT INTO location_checks (student_id, checkpoint_id, checked_at, inside_radius) VALUES (?, ?, ?, ?)',
        [studentId, checkpointId, at(clock.now()), outcome === 'verified' ? 1 : 0],
      );
    }
    return outcome;
  }

  // ---------- starting an attempt (BR09, BR13, BR23) ----------
  async function startAttempt(studentId, checkpointId) {
    const checkpoint = await checkGuards(studentId, checkpointId);
    const now = clock.now();
    try {
      const attemptId = await withTransaction(pool, async (conn) => {
        await conn.query('SELECT student_id FROM students WHERE student_id = ? FOR UPDATE', [
          studentId,
        ]);
        const [[check]] = await conn.query(
          `SELECT check_id FROM location_checks
           WHERE student_id = ? AND checkpoint_id = ? AND inside_radius = 1 AND used_by_attempt_id IS NULL AND checked_at >= ?
           ORDER BY checked_at DESC LIMIT 1 FOR UPDATE`,
          [studentId, checkpointId, at(now - config.locationVerificationValidMinutes * 60 * 1000)],
        );
        if (!check)
          throw new AppError(409, 'LOCATION_NOT_VERIFIED', 'Please check your location first.');
        const [[{ used }]] = await conn.query(
          'SELECT COUNT(*) AS used FROM attempts WHERE student_id = ? AND checkpoint_id = ?',
          [studentId, checkpointId],
        );
        const [drawn] = await conn.query(
          "SELECT question_id FROM questions WHERE checkpoint_id = ? AND difficulty = 'NORMAL' AND is_active = 1 ORDER BY RAND() LIMIT ?",
          [checkpointId, checkpoint.question_count],
        );
        if (drawn.length < checkpoint.question_count) {
          throw new AppError(
            503,
            'DRAW_IMPOSSIBLE',
            'This checkpoint has too few questions right now.',
          );
        }
        const expires = now + checkpoint.question_count * SECONDS_PER_QUESTION * 1000;
        const [inserted] = await conn.query(
          "INSERT INTO attempts (student_id, checkpoint_id, attempt_number, start_time, expires_at, status) VALUES (?, ?, ?, ?, ?, 'active')",
          [studentId, checkpointId, used + 1, at(now), at(expires)],
        );
        for (let i = 0; i < drawn.length; i += 1) {
          await conn.query(
            'INSERT INTO attempt_questions (attempt_id, question_number, question_id) VALUES (?, ?, ?)',
            [inserted.insertId, i + 1, drawn[i].question_id],
          );
        }
        await conn.query('UPDATE location_checks SET used_by_attempt_id = ? WHERE check_id = ?', [
          inserted.insertId,
          check.check_id,
        ]);
        return inserted.insertId;
      });
      return await buildAttemptView(pool, attemptId);
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        throw new AppError(409, 'ACTIVE_ATTEMPT_EXISTS', 'You have a quiz in progress.');
      }
      throw error;
    }
  }

  async function getActiveAttempt(studentId) {
    await finalizeExpiredFor(studentId);
    const [[active]] = await pool.query(
      "SELECT attempt_id FROM attempts WHERE student_id = ? AND status = 'active'",
      [studentId],
    );
    return active ? buildAttemptView(pool, active.attempt_id) : null;
  }

  // ---------- answering (BR14, BR20, BR22, BR25) ----------
  async function lockAttempt(conn, studentId, attemptId) {
    await conn.query('SELECT student_id FROM students WHERE student_id = ? FOR UPDATE', [
      studentId,
    ]);
    const [[attempt]] = await conn.query(
      'SELECT * FROM attempts WHERE attempt_id = ? AND student_id = ? FOR UPDATE',
      [attemptId, studentId],
    );
    if (!attempt) throw notFound('Attempt not found.');
    return attempt;
  }

  const assertActive = (attempt, nowMs) => {
    if (attempt.status !== 'active') {
      throw new AppError(
        409,
        attempt.end_reason === 'expired' ? 'ATTEMPT_EXPIRED' : 'ATTEMPT_NOT_ACTIVE',
        attempt.end_reason === 'expired' ? 'Time is up.' : 'This attempt is finished.',
      );
    }
    if (nowMs >= attempt.expires_at.getTime())
      throw new AppError(409, 'ATTEMPT_EXPIRED', 'Time is up.');
  };

  async function answer(studentId, attemptId, optionId, questionNumber) {
    // If the deadline passed, close the attempt first (its own transaction) so the points are not lost.
    const [[owned]] = await pool.query(
      'SELECT attempt_id FROM attempts WHERE attempt_id = ? AND student_id = ?',
      [attemptId, studentId],
    );
    if (!owned) throw notFound('Attempt not found.');
    await finalizeIfExpired(attemptId);

    const now = clock.now();
    const outcome = await withTransaction(pool, async (conn) => {
      const attempt = await lockAttempt(conn, studentId, attemptId);
      assertActive(attempt, now);
      const [slots] = await conn.query(
        `SELECT aq.question_number, aq.question_id, aq.selected_option_id, q.difficulty
         FROM attempt_questions aq JOIN questions q ON q.question_id = aq.question_id
         WHERE aq.attempt_id = ? ORDER BY aq.question_number FOR UPDATE`,
        [attemptId],
      );
      const slot = slots.find((s) => s.selected_option_id === null);
      if (!slot) throw new AppError(409, 'ATTEMPT_NOT_ACTIVE', 'All questions are answered.');
      if (questionNumber !== undefined && questionNumber !== slot.question_number) {
        throw new AppError(
          409,
          questionNumber < slot.question_number ? 'ALREADY_ANSWERED' : 'WRONG_QUESTION',
          'That is not the current question.',
        );
      }
      const [[option]] = await conn.query(
        'SELECT option_id, is_correct FROM options WHERE option_id = ? AND question_id = ?',
        [optionId, slot.question_id],
      );
      if (!option)
        throw new AppError(400, 'INVALID_OPTION', 'That option does not belong to this question.');

      await conn.query(
        'UPDATE attempt_questions SET selected_option_id = ?, answered_at = ? WHERE attempt_id = ? AND question_number = ?',
        [optionId, at(now), attemptId, slot.question_number],
      );
      const correct = Boolean(option.is_correct);

      // BR20: attempt 1 only, first four answers correct, checkpoint offers a hard question.
      if (slot.question_number === 4 && attempt.attempt_number === 1) {
        const [[checkpoint]] = await conn.query(
          'SELECT question_count, hard_question_enabled FROM checkpoints WHERE checkpoint_id = ?',
          [attempt.checkpoint_id],
        );
        const earlier = slots.filter((s) => s.question_number < 4);
        const [rows] = earlier.length
          ? await conn.query('SELECT is_correct FROM options WHERE option_id IN (?)', [
              earlier.map((s) => s.selected_option_id),
            ])
          : [[]];
        const firstFourCorrect = correct && rows.length === 3 && rows.every((r) => r.is_correct);
        if (
          checkpoint.hard_question_enabled &&
          checkpoint.question_count === 5 &&
          firstFourCorrect
        ) {
          const [[{ hard }]] = await conn.query(
            "SELECT COUNT(*) AS hard FROM questions WHERE checkpoint_id = ? AND difficulty = 'HARD' AND is_active = 1",
            [attempt.checkpoint_id],
          );
          if (hard > 0)
            await conn.query('UPDATE attempts SET hard_unlocked = 1 WHERE attempt_id = ?', [
              attemptId,
            ]);
        }
      }

      const last = slots.every(
        (s) => s.question_number === slot.question_number || s.selected_option_id !== null,
      );
      let score = null;
      if (last) {
        const [[fresh]] = await conn.query('SELECT * FROM attempts WHERE attempt_id = ?', [
          attemptId,
        ]);
        score = await finalizeAttempt(conn, fresh, 'completed', now);
      }
      return { correct, score, questionId: slot.question_id };
    });

    let correctOptionId;
    if (!outcome.correct) {
      const [[right]] = await pool.query(
        'SELECT option_id FROM options WHERE question_id = ? AND is_correct = 1',
        [outcome.questionId],
      );
      correctOptionId = right?.option_id;
    }
    const view = await buildAttemptView(pool, attemptId);
    const response = { correct: outcome.correct, attempt: view };
    if (correctOptionId !== undefined) response.correctOptionId = correctOptionId;
    if (outcome.score) response.result = await getResult(studentId, attemptId);
    return response;
  }

  async function acceptHard(studentId, attemptId) {
    const now = clock.now();
    const [[owned]] = await pool.query(
      'SELECT attempt_id FROM attempts WHERE attempt_id = ? AND student_id = ?',
      [attemptId, studentId],
    );
    if (!owned) throw notFound('Attempt not found.');
    await finalizeIfExpired(attemptId);
    await withTransaction(pool, async (conn) => {
      const attempt = await lockAttempt(conn, studentId, attemptId);
      assertActive(attempt, now);
      const [[slot5]] = await conn.query(
        'SELECT * FROM attempt_questions WHERE attempt_id = ? AND question_number = 5 FOR UPDATE',
        [attemptId],
      );
      if (
        !attempt.hard_unlocked ||
        !slot5 ||
        slot5.selected_option_id !== null ||
        slot5.replaced_question_id
      ) {
        throw new AppError(409, 'HARD_NOT_AVAILABLE', 'The hard question is not available.');
      }
      const [[hard]] = await conn.query(
        "SELECT question_id FROM questions WHERE checkpoint_id = ? AND difficulty = 'HARD' AND is_active = 1 ORDER BY RAND() LIMIT 1",
        [attempt.checkpoint_id],
      );
      if (!hard)
        throw new AppError(409, 'HARD_NOT_AVAILABLE', 'The hard question is not available.');
      await conn.query(
        'UPDATE attempt_questions SET replaced_question_id = question_id, question_id = ? WHERE attempt_id = ? AND question_number = 5',
        [hard.question_id, attemptId],
      );
    });
    return buildAttemptView(pool, attemptId);
  }

  async function getAttempt(studentId, attemptId) {
    await finalizeIfExpired(attemptId);
    const [[owned]] = await pool.query(
      'SELECT attempt_id FROM attempts WHERE attempt_id = ? AND student_id = ?',
      [attemptId, studentId],
    );
    if (!owned) throw notFound('Attempt not found.');
    return buildAttemptView(pool, attemptId);
  }

  /** Solo rank a student with this total would hold (the student's own row is not counted against itself). */
  async function rankAmong(total, studentId) {
    const [[row]] = await pool.query(
      'SELECT COUNT(*) AS higher FROM students WHERE total_points > ? AND student_id <> ?',
      [total, studentId],
    );
    return Number(row.higher) + 1;
  }

  async function getResult(studentId, attemptId) {
    await finalizeIfExpired(attemptId);
    const [[attempt]] = await pool.query(
      'SELECT * FROM attempts WHERE attempt_id = ? AND student_id = ?',
      [attemptId, studentId],
    );
    if (!attempt) throw notFound('Attempt not found.');
    if (attempt.status === 'active')
      throw new AppError(409, 'ATTEMPT_NOT_FINISHED', 'This attempt is still running.');
    const [[student]] = await pool.query(
      'SELECT total_points, points_exact_x100 FROM students WHERE student_id = ?',
      [studentId],
    );
    const rules = await loadRules(pool);
    // Total before this attempt: exact sum minus this attempt's exact points, rounded up once (R-02).
    const totalBefore = ceilDiv(
      Math.max(0, Number(student.points_exact_x100) - Number(attempt.points_exact)),
      100,
    );
    const [[{ passed }]] = await pool.query(
      "SELECT COUNT(*) AS passed FROM attempts WHERE student_id = ? AND checkpoint_id = ? AND status = 'passed'",
      [studentId, attempt.checkpoint_id],
    );
    const [[checkpoint]] = await pool.query(
      'SELECT question_count, pass_threshold FROM checkpoints WHERE checkpoint_id = ?',
      [attempt.checkpoint_id],
    );
    const [[{ used }]] = await pool.query(
      'SELECT COUNT(*) AS used FROM attempts WHERE student_id = ? AND checkpoint_id = ?',
      [studentId, attempt.checkpoint_id],
    );
    return {
      attemptId: attempt.attempt_id,
      checkpointId: attempt.checkpoint_id,
      attemptNumber: attempt.attempt_number,
      passed: attempt.status === 'passed',
      status: attempt.status,
      endReason: attempt.end_reason,
      correctCount: attempt.correct_count,
      questionCount: checkpoint.question_count,
      passThreshold: checkpoint.pass_threshold,
      basePoints: attempt.base_points,
      timeBonus: attempt.time_bonus,
      fullClearBonus: attempt.full_clear_bonus,
      multiplierPercent: attempt.multiplier_percent,
      pointsEarned: attempt.points_earned,
      totalPoints: student.total_points,
      rankBefore: await rankAmong(totalBefore, studentId),
      rankAfter: await rankAmong(student.total_points, studentId),
      nextMultiplierPercent: multiplierFor(rules.multipliers, used + 1),
      checkpointCompleted: passed > 0,
      nextAttemptNumber: used + 1,
    };
  }

  /** R-63: location rows are only kept for a short time (default 7 days). */
  async function purgeOldLocationChecks() {
    await pool.query('DELETE FROM location_checks WHERE checked_at < ?', [
      at(clock.now() - config.locationRetentionDays * 24 * 3600 * 1000),
    ]);
  }

  return {
    purgeOldLocationChecks,
    listCheckpoints,
    locationCheck,
    startAttempt,
    getActiveAttempt,
    answer,
    acceptHard,
    getAttempt,
    getResult,
    finalizeAllExpired,
    finalizeIfExpired,
  };
}
