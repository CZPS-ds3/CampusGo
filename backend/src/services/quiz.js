// Checkpoints, location check, attempts, answers and scoring (BR07-BR25).
// The server decides time, state and points. Constants come from the database tables (BR11).
import { at } from '../clock.js';
import { withTransaction } from '../db/pool.js';
import { AppError, notFound } from '../middleware/errors.js';
import { evaluateLocation } from './geo.js';
import { ceilDiv, multiplierFor, remainingWholeSeconds, scoreAttempt } from './scoring.js';
import { refreshTeamScore } from './teams.js';

/**
 * Questions that may be drawn: active, from this checkpoint's bank, with exactly four options of which
 * exactly one is correct (BR10). A broken question in the bank is skipped instead of reaching a student.
 */
const DRAWABLE_QUESTIONS = `SELECT q.question_id FROM questions q JOIN options o ON o.question_id = q.question_id
  WHERE q.checkpoint_id = ? AND q.difficulty = ? AND q.is_active = 1
  GROUP BY q.question_id HAVING COUNT(*) = 4 AND SUM(o.is_correct) = 1
  ORDER BY RAND() LIMIT ?`;

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
    // Only active checkpoints are shown on the map (BR08).
    const [rows] = await pool.query(
      'SELECT * FROM checkpoints WHERE is_active = 1 ORDER BY checkpoint_id',
    );
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
    const [imageRows] = await pool.query(
      'SELECT checkpoint_id, url, alt_text, credit FROM checkpoint_images ORDER BY checkpoint_id, position',
    );
    const images = new Map();
    for (const i of imageRows) {
      const image = { url: i.url, alt: i.alt_text, credit: i.credit };
      images.set(i.checkpoint_id, [...(images.get(i.checkpoint_id) ?? []), image]);
    }
    return rows.map((c) => {
      const s = byId.get(c.checkpoint_id);
      const used = Number(s?.used ?? 0);
      return mapCheckpoint(c, {
        completed: Number(s?.passed ?? 0) > 0,
        attemptsUsed: used,
        nextAttemptNumber: used + 1,
        bestScore: bestById.get(c.checkpoint_id) ?? 0,
        facts: facts.get(c.checkpoint_id) ?? [],
        images: images.get(c.checkpoint_id) ?? [],
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

  // ---------- geofence verification and unlock (BR08, BR12, BR13, BR23, BR25) ----------
  // Main Project Document, "Geofencing Architecture", Figure 3. Every refusal before the unlock is a retry:
  // no attempt is used and no timer starts. Coordinates are only used inside this request and never stored.

  async function runningAttempt(studentId) {
    await finalizeExpiredFor(studentId);
    const [[active]] = await pool.query(
      "SELECT attempt_id, checkpoint_id FROM attempts WHERE student_id = ? AND status = 'active'",
      [studentId],
    );
    return active ?? null;
  }

  const resumed = async (attemptId) => ({
    status: 'OK',
    resumed: true,
    attempt: await buildAttemptView(pool, attemptId),
  });

  /** Only "inside radius yes/no" and the time are kept (privacy rule, R-63). */
  const recordCheck = (conn, studentId, checkpointId, inside, attemptId = null) =>
    conn.query(
      'INSERT INTO location_checks (student_id, checkpoint_id, checked_at, inside_radius, used_by_attempt_id) VALUES (?, ?, ?, ?, ?)',
      [studentId, checkpointId, at(clock.now()), inside ? 1 : 0, attemptId],
    );

  /** The unlock: creates the attempt, starts the timer and draws the questions in one transaction. */
  async function unlock(studentId, checkpoint) {
    const now = clock.now();
    return withTransaction(pool, async (conn) => {
      await conn.query('SELECT student_id FROM students WHERE student_id = ? FOR UPDATE', [
        studentId,
      ]);
      // Re-checked under the lock: an attempt may have been passed since the first check (BR23).
      const [[passed]] = await conn.query(
        "SELECT attempt_id FROM attempts WHERE student_id = ? AND checkpoint_id = ? AND status = 'passed'",
        [studentId, checkpoint.checkpoint_id],
      );
      if (passed)
        throw new AppError(409, 'ALREADY_COMPLETED', 'You already completed this checkpoint.');
      const [[{ used }]] = await conn.query(
        'SELECT COUNT(*) AS used FROM attempts WHERE student_id = ? AND checkpoint_id = ?',
        [studentId, checkpoint.checkpoint_id],
      );
      const [drawn] = await conn.query(DRAWABLE_QUESTIONS, [
        checkpoint.checkpoint_id,
        'NORMAL',
        checkpoint.question_count,
      ]);
      if (drawn.length < checkpoint.question_count) {
        throw new AppError(
          503,
          'DRAW_IMPOSSIBLE',
          'This checkpoint has too few questions right now.',
        );
      }
      const expires = now + checkpoint.question_count * config.secondsPerQuestion * 1000;
      const [inserted] = await conn.query(
        "INSERT INTO attempts (student_id, checkpoint_id, attempt_number, start_time, expires_at, status) VALUES (?, ?, ?, ?, ?, 'active')",
        [studentId, checkpoint.checkpoint_id, Number(used) + 1, at(now), at(expires)],
      );
      for (let i = 0; i < drawn.length; i += 1) {
        await conn.query(
          'INSERT INTO attempt_questions (attempt_id, question_number, question_id) VALUES (?, ?, ?)',
          [inserted.insertId, i + 1, drawn[i].question_id],
        );
      }
      await recordCheck(conn, studentId, checkpoint.checkpoint_id, true, inserted.insertId);
      return inserted.insertId;
    });
  }

  /**
   * POST /checkpoints/:id/verify. Returns { status: 'OK', attempt } on unlock or resume, or
   * { status: 'OUTSIDE', distanceM, message }. Every other refusal is thrown as an AppError.
   * @param {{ lat: number, lng: number, accuracy: number, ageMs: number }} reading
   */
  async function verifyAndStart(studentId, checkpointId, reading) {
    const [[checkpoint]] = await pool.query(
      'SELECT * FROM checkpoints WHERE checkpoint_id = ? AND is_active = 1',
      [checkpointId],
    );
    if (!checkpoint) throw new AppError(404, 'NOT_AVAILABLE', 'This checkpoint is not available.');
    const [[passed]] = await pool.query(
      "SELECT attempt_id FROM attempts WHERE student_id = ? AND checkpoint_id = ? AND status = 'passed'",
      [studentId, checkpointId],
    );
    if (passed)
      throw new AppError(409, 'ALREADY_COMPLETED', 'You already completed this checkpoint.');

    // A refresh, reconnect or double tap gets the same attempt and timer back (BR25), before any location check.
    const running = await runningAttempt(studentId);
    if (running && Number(running.checkpoint_id) === checkpointId)
      return resumed(running.attempt_id);
    if (running) {
      throw new AppError(409, 'ACTIVE_ATTEMPT_EXISTS', 'You have a quiz in progress.', {
        attemptId: running.attempt_id,
      });
    }

    const [[student]] = await pool.query(
      'SELECT location_consent_at FROM students WHERE student_id = ?',
      [studentId],
    );
    if (!student.location_consent_at)
      throw new AppError(403, 'CONSENT_REQUIRED', 'Please accept the location notice first.');

    const [others] = await pool.query(
      'SELECT checkpoint_id, checkpoint_name, latitude, longitude, radius FROM checkpoints WHERE is_active = 1 AND checkpoint_id <> ?',
      [checkpointId],
    );
    const { outcome, distanceM, elsewhere } = evaluateLocation(reading, checkpoint, config, others);
    if (outcome === 'stale') {
      throw new AppError(
        422,
        'STALE_POSITION',
        'Your location reading is too old. Please try again.',
      );
    }
    if (outcome === 'poor_accuracy') {
      throw new AppError(
        422,
        'ACCURACY_TOO_LOW',
        'Your location is not precise enough. Move near a window or outside and try again.',
      );
    }
    if (outcome === 'outside' || outcome === 'elsewhere') {
      await recordCheck(pool, studentId, checkpointId, false);
      const name = checkpoint.checkpoint_name;
      return {
        status: 'OUTSIDE',
        distanceM,
        elsewhere: elsewhere ?? null,
        // Overlapping circles: standing at another checkpoint (for example Building C) never unlocks this one.
        message:
          outcome === 'elsewhere'
            ? `You are at ${elsewhere}, not at ${name}. Walk to ${name} and try again.`
            : `You are about ${distanceM} m from ${name}. Walk closer and try again.`,
      };
    }

    try {
      const attemptId = await unlock(studentId, checkpoint);
      return { status: 'OK', resumed: false, attempt: await buildAttemptView(pool, attemptId) };
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
      // Two taps raced and the unique keys stopped the second one: hand back the attempt that won.
      const winner = await runningAttempt(studentId);
      if (winner && Number(winner.checkpoint_id) === checkpointId)
        return resumed(winner.attempt_id);
      throw new AppError(409, 'ACTIVE_ATTEMPT_EXISTS', 'You have a quiz in progress.', {
        attemptId: winner?.attempt_id,
      });
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
    await assertOwned(studentId, attemptId);
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
          const [hard] = await conn.query(DRAWABLE_QUESTIONS, [attempt.checkpoint_id, 'HARD', 1]);
          if (hard.length > 0)
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
    await assertOwned(studentId, attemptId);
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
      const [[hard]] = await conn.query(DRAWABLE_QUESTIONS, [attempt.checkpoint_id, 'HARD', 1]);
      if (!hard)
        throw new AppError(409, 'HARD_NOT_AVAILABLE', 'The hard question is not available.');
      await conn.query(
        'UPDATE attempt_questions SET replaced_question_id = question_id, question_id = ? WHERE attempt_id = ? AND question_number = 5',
        [hard.question_id, attemptId],
      );
    });
    return buildAttemptView(pool, attemptId);
  }

  /** Ownership is checked before anything else touches the attempt (OWASP A01). */
  async function assertOwned(studentId, attemptId) {
    const [[owned]] = await pool.query(
      'SELECT attempt_id FROM attempts WHERE attempt_id = ? AND student_id = ?',
      [attemptId, studentId],
    );
    if (!owned) throw notFound('Attempt not found.');
  }

  async function getAttempt(studentId, attemptId) {
    await assertOwned(studentId, attemptId);
    await finalizeIfExpired(attemptId);
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
    await assertOwned(studentId, attemptId);
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
    verifyAndStart,
    getActiveAttempt,
    answer,
    acceptHard,
    getAttempt,
    getResult,
    finalizeAllExpired,
    finalizeIfExpired,
  };
}
