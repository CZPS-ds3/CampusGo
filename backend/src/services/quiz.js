// Checkpoints, location check, attempts, answers and scoring (BR07-BR25).
// The server decides time, state and points. Constants come from the database tables (BR11).
import { at } from '../clock.js';
import { withTransaction } from '../db/pool.js';
import { AppError, notFound } from '../middleware/errors.js';
import { evaluateLocation } from './geo.js';
import { ceilDiv, multiplierFor, remainingWholeSeconds, scoreAttempt } from './scoring.js';
import { teamStandingAround } from './team-ranking.js';
import { refreshTeamScore } from './teams.js';

/**
 * Questions that may be drawn: active, from this checkpoint's bank, of the allowed types, with exactly four options
 * of which exactly one (MCQ) or two or three (multi-select) are correct (BR10, BR50). A broken question in the bank
 * is skipped instead of reaching a student.
 */
export const DRAWABLE_QUESTIONS = `SELECT q.question_id, q.question_type FROM questions q JOIN options o ON o.question_id = q.question_id
  WHERE q.checkpoint_id = ? AND q.difficulty = ? AND q.is_active = 1 AND q.question_type IN (?)
  GROUP BY q.question_id HAVING COUNT(*) = 4 AND ((q.question_type = 'MCQ' AND SUM(o.is_correct) = 1)
    OR (q.question_type = 'MULTI' AND SUM(o.is_correct) BETWEEN 2 AND 3))
  ORDER BY RAND() LIMIT ?`;

const TYPES_OF_MODE = { MCQ_ONLY: ['MCQ'], MULTI_ONLY: ['MULTI'], MIXED: ['MCQ', 'MULTI'] };
export const typesOfMode = (mode) => TYPES_OF_MODE[mode] ?? TYPES_OF_MODE.MCQ_ONLY;

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

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
    description: c.description ?? '',
    questionCount: c.question_count,
    passThreshold: c.pass_threshold,
    hardQuestionEnabled: Boolean(c.hard_question_enabled),
    typeMode: c.type_mode,
    // What the student is told before starting: the types that can appear (BR50).
    questionTypes: typesOfMode(c.type_mode),
    timeLimitSeconds: c.time_limit_seconds ?? c.question_count * config.secondsPerQuestion,
    ...extra,
  });

  async function listCheckpoints(studentId) {
    // Students see only active checkpoints on the map (BR08); administrators see all of them to test them.
    const [[who]] = await pool.query('SELECT role FROM students WHERE student_id = ?', [studentId]);
    const [rows] = await pool.query(
      'SELECT * FROM checkpoints WHERE archived_at IS NULL AND (is_active = 1 OR ?) ORDER BY checkpoint_id',
      [who?.role === 'admin' ? 1 : 0],
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
      `SELECT a.*, c.checkpoint_name FROM attempts a
       JOIN checkpoints c ON c.checkpoint_id = a.checkpoint_id WHERE a.attempt_id = ?`,
      [attemptId],
    );
    const [slots] = await conn.query(
      `SELECT aq.question_number, aq.question_id, aq.replaced_question_id, aq.selected_option_id, aq.answered_at,
              aq.is_correct, q.question_text, q.difficulty, q.question_type
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
    const [answerRows] = await conn.query(
      'SELECT question_number, option_id FROM attempt_answers WHERE attempt_id = ? ORDER BY question_number, option_id',
      [attemptId],
    );
    const chosen = new Map();
    for (const a of answerRows) {
      chosen.set(a.question_number, [...(chosen.get(a.question_number) ?? []), a.option_id]);
    }
    const byQuestion = new Map();
    for (const o of options) {
      if (!byQuestion.has(o.question_id)) byQuestion.set(o.question_id, []);
      byQuestion.get(o.question_id).push(o);
    }
    const questions = slots.map((s) => {
      const opts = byQuestion.get(s.question_id) ?? [];
      const answered = s.answered_at !== null;
      const wrong = answered && !s.is_correct;
      const view = {
        number: s.question_number,
        id: s.question_id,
        text: s.question_text,
        difficulty: s.difficulty,
        type: s.question_type,
        options: opts.map((o) => ({
          id: o.option_id,
          position: o.option_position,
          text: o.option_text,
        })),
        selectedOptionId: s.selected_option_id,
        selectedOptionIds: chosen.get(s.question_number) ?? [],
        answered,
      };
      // BR14: the right answer is revealed only after a wrong pick. Never before the answer, and never how
      // many options are right.
      if (wrong) {
        view.correctOptionIds = opts.filter((o) => o.is_correct).map((o) => o.option_id);
        view.correctOptionId = view.correctOptionIds[0] ?? null;
      }
      if (answered) view.correct = !wrong;
      return view;
    });
    const next = slots.find((s) => s.answered_at === null);
    const rules = await loadRules(conn);
    const lastSlot = slots.find((s) => s.question_number === attempt.question_count);
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
      hardAccepted: Boolean(lastSlot?.replaced_question_id),
      timeLimitSeconds: Math.round(
        (attempt.expires_at.getTime() - attempt.start_time.getTime()) / 1000,
      ),
      currentQuestion: attempt.status === 'active' && next ? next.question_number : null,
      questions,
    };
  }

  // ---------- finishing an attempt ----------
  /** Scores and closes an attempt inside the caller's transaction (R-08, R-22). Student row must be locked. */
  async function finalizeAttempt(conn, attempt, endReason, nowMs) {
    const rules = await loadRules(conn);
    const [slots] = await conn.query(
      `SELECT q.difficulty, COALESCE(aq.is_correct, 0) AS correct
       FROM attempt_questions aq
       JOIN questions q ON q.question_id = aq.question_id
       WHERE aq.attempt_id = ? ORDER BY aq.question_number`,
      [attempt.attempt_id],
    );
    // The attempt keeps the question count and pass mark it started with (an edit of the quest cannot change them).
    const checkpoint = attempt;
    const finishedMs = endReason === 'expired' ? attempt.expires_at.getTime() : nowMs;
    const score = scoreAttempt({
      slots: slots.map((s) => ({ difficulty: s.difficulty, correct: Boolean(s.correct) })),
      questionCount: checkpoint.question_count,
      passThreshold: checkpoint.pass_threshold,
      attemptNumber: attempt.attempt_number,
      // A long custom time limit cannot inflate the time bonus: it is capped at the default time of the quest.
      remainingSeconds:
        endReason === 'expired'
          ? 0
          : Math.min(
              remainingWholeSeconds(attempt.expires_at.getTime(), finishedMs),
              attempt.question_count * config.secondsPerQuestion,
            ),
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

  /** An administrator's earlier test attempts at a checkpoint are removed so that every test starts fresh. */
  async function clearTestHistory(studentId, checkpointId) {
    await withTransaction(pool, async (conn) => {
      await conn.query(
        `DELETE aa FROM attempt_answers aa JOIN attempts a ON a.attempt_id = aa.attempt_id
         WHERE a.student_id = ? AND a.checkpoint_id = ?`,
        [studentId, checkpointId],
      );
      await conn.query(
        `DELETE aq FROM attempt_questions aq JOIN attempts a ON a.attempt_id = aq.attempt_id
         WHERE a.student_id = ? AND a.checkpoint_id = ?`,
        [studentId, checkpointId],
      );
      await conn.query('DELETE FROM location_checks WHERE student_id = ? AND checkpoint_id = ?', [
        studentId,
        checkpointId,
      ]);
      await conn.query('DELETE FROM attempts WHERE student_id = ? AND checkpoint_id = ?', [
        studentId,
        checkpointId,
      ]);
    });
  }

  /**
   * The questions of a new attempt. MCQ_ONLY and MULTI_ONLY draw only that type. MIXED always holds at least one of
   * each type among the first questions (the last slot is the one a hard question may replace), so what the student
   * was told before starting is true.
   */
  async function drawQuestions(conn, checkpoint) {
    const count = checkpoint.question_count;
    const tooFew = () =>
      new AppError(503, 'DRAW_IMPOSSIBLE', 'This checkpoint has too few questions right now.');
    const pick = async (types, n, exclude = []) => {
      const [rows] = await conn.query(DRAWABLE_QUESTIONS, [
        checkpoint.checkpoint_id,
        'NORMAL',
        types,
        n + exclude.length,
      ]);
      return rows.filter((r) => !exclude.includes(r.question_id)).slice(0, n);
    };
    if (checkpoint.type_mode !== 'MIXED') {
      const rows = await pick(typesOfMode(checkpoint.type_mode), count);
      if (rows.length < count) throw tooFew();
      return rows;
    }
    const [mcq] = await pick(['MCQ'], 1);
    const [multi] = await pick(['MULTI'], 1);
    if (!mcq || !multi) throw tooFew();
    const taken = [mcq.question_id, multi.question_id];
    const rest = await pick(['MCQ', 'MULTI'], count - 2, taken);
    if (rest.length < count - 2) throw tooFew();
    const [last, ...fillers] = rest.length > 0 ? [rest[rest.length - 1], ...rest.slice(0, -1)] : [];
    return rest.length > 0 ? [...shuffle([mcq, multi, ...fillers]), last] : shuffle([mcq, multi]);
  }

  /** The unlock: creates the attempt, starts the timer and draws the questions in one transaction. */
  async function unlock(studentId, checkpoint, { testMode = false } = {}) {
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
      if (passed && !testMode)
        throw new AppError(409, 'ALREADY_COMPLETED', 'You already completed this checkpoint.');
      const [[{ used }]] = await conn.query(
        'SELECT COUNT(*) AS used FROM attempts WHERE student_id = ? AND checkpoint_id = ?',
        [studentId, checkpoint.checkpoint_id],
      );
      const drawn = await drawQuestions(conn, checkpoint);
      const seconds =
        checkpoint.time_limit_seconds ?? checkpoint.question_count * config.secondsPerQuestion;
      const expires = now + seconds * 1000;
      const [inserted] = await conn.query(
        "INSERT INTO attempts (student_id, checkpoint_id, attempt_number, start_time, expires_at, question_count, pass_threshold, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')",
        [
          studentId,
          checkpoint.checkpoint_id,
          Number(used) + 1,
          at(now),
          at(expires),
          checkpoint.question_count,
          checkpoint.pass_threshold,
        ],
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
    const [[who]] = await pool.query(
      'SELECT location_consent_at, role FROM students WHERE student_id = ?',
      [studentId],
    );
    // Administrators test the quizzes from anywhere: any checkpoint, active or not, as often as they like.
    const testMode = who.role === 'admin';
    const [[checkpoint]] = await pool.query(
      'SELECT * FROM checkpoints WHERE checkpoint_id = ? AND archived_at IS NULL AND (is_active = 1 OR ?)',
      [checkpointId, testMode ? 1 : 0],
    );
    if (!checkpoint) throw new AppError(404, 'NOT_AVAILABLE', 'This checkpoint is not available.');
    const [[passed]] = await pool.query(
      "SELECT attempt_id FROM attempts WHERE student_id = ? AND checkpoint_id = ? AND status = 'passed'",
      [studentId, checkpointId],
    );
    if (passed && !testMode)
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

    if (testMode) {
      await clearTestHistory(studentId, checkpointId);
      const attemptId = await unlock(studentId, checkpoint, { testMode });
      return { status: 'OK', resumed: false, attempt: await buildAttemptView(pool, attemptId) };
    }

    if (!who.location_consent_at)
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

  /** Exact match only (BR50): the ticked options must be precisely the right ones of the question. */
  const isExactMatch = (options, chosenIds) => {
    const right = options.filter((o) => o.is_correct).map((o) => o.option_id);
    return right.length === chosenIds.length && right.every((id) => chosenIds.includes(id));
  };

  /** The ticked option ids of an answer, from the new `optionIds` or the single `optionId` of the first API. */
  const chosenOf = (optionIds, optionId) => [...new Set(optionIds ?? [optionId])];

  async function answer(studentId, attemptId, optionId, questionNumber, optionIds) {
    // If the deadline passed, close the attempt first (its own transaction) so the points are not lost.
    await assertOwned(studentId, attemptId);
    await finalizeIfExpired(attemptId);

    const chosen = chosenOf(optionIds, optionId);
    const now = clock.now();
    const outcome = await withTransaction(pool, async (conn) => {
      const attempt = await lockAttempt(conn, studentId, attemptId);
      assertActive(attempt, now);
      const [slots] = await conn.query(
        `SELECT aq.question_number, aq.question_id, aq.answered_at, aq.is_correct, q.difficulty, q.question_type
         FROM attempt_questions aq JOIN questions q ON q.question_id = aq.question_id
         WHERE aq.attempt_id = ? ORDER BY aq.question_number FOR UPDATE`,
        [attemptId],
      );
      const slot = slots.find((s) => s.answered_at === null);
      if (!slot) throw new AppError(409, 'ATTEMPT_NOT_ACTIVE', 'All questions are answered.');
      if (questionNumber !== undefined && questionNumber !== slot.question_number) {
        throw new AppError(
          409,
          questionNumber < slot.question_number ? 'ALREADY_ANSWERED' : 'WRONG_QUESTION',
          'That is not the current question.',
        );
      }
      const [options] = await conn.query(
        'SELECT option_id, is_correct FROM options WHERE question_id = ?',
        [slot.question_id],
      );
      if (chosen.some((id) => !options.some((o) => o.option_id === id))) {
        throw new AppError(400, 'INVALID_OPTION', 'That option does not belong to this question.');
      }
      if (slot.question_type === 'MCQ' && chosen.length !== 1) {
        throw new AppError(400, 'INVALID_OPTION', 'Choose exactly one option.');
      }
      if (slot.question_type === 'MULTI' && chosen.length < 1) {
        throw new AppError(400, 'INVALID_OPTION', 'Choose at least one option.');
      }
      const correct = isExactMatch(options, chosen);

      await conn.query(
        'UPDATE attempt_questions SET selected_option_id = ?, is_correct = ?, answered_at = ? WHERE attempt_id = ? AND question_number = ?',
        [chosen[0], correct ? 1 : 0, at(now), attemptId, slot.question_number],
      );
      await conn.query(
        'INSERT INTO attempt_answers (attempt_id, question_number, question_id, option_id) VALUES ?',
        [chosen.map((id) => [attemptId, slot.question_number, slot.question_id, id])],
      );

      // BR20: attempt 1 only, every answer before the last slot correct, quest offers a hard question.
      const beforeLast = attempt.question_count - 1;
      if (slot.question_number === beforeLast && attempt.attempt_number === 1) {
        const [[checkpoint]] = await conn.query(
          'SELECT hard_question_enabled, type_mode FROM checkpoints WHERE checkpoint_id = ?',
          [attempt.checkpoint_id],
        );
        const earlier = slots.filter((s) => s.question_number < beforeLast);
        const allCorrect = correct && earlier.every((s) => Boolean(s.is_correct));
        if (checkpoint.hard_question_enabled && allCorrect) {
          const [hard] = await conn.query(DRAWABLE_QUESTIONS, [
            attempt.checkpoint_id,
            'HARD',
            typesOfMode(checkpoint.type_mode),
            1,
          ]);
          if (hard.length > 0)
            await conn.query('UPDATE attempts SET hard_unlocked = 1 WHERE attempt_id = ?', [
              attemptId,
            ]);
        }
      }

      const last = slots.every(
        (s) => s.question_number === slot.question_number || s.answered_at !== null,
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

    let correctOptionIds;
    if (!outcome.correct) {
      const [right] = await pool.query(
        'SELECT option_id FROM options WHERE question_id = ? AND is_correct = 1 ORDER BY option_id',
        [outcome.questionId],
      );
      correctOptionIds = right.map((r) => r.option_id);
    }
    const view = await buildAttemptView(pool, attemptId);
    const response = { correct: outcome.correct, attempt: view };
    if (correctOptionIds !== undefined) {
      response.correctOptionIds = correctOptionIds;
      response.correctOptionId = correctOptionIds[0];
    }
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
      const [[lastSlot]] = await conn.query(
        'SELECT * FROM attempt_questions WHERE attempt_id = ? AND question_number = ? FOR UPDATE',
        [attemptId, attempt.question_count],
      );
      if (
        !attempt.hard_unlocked ||
        !lastSlot ||
        lastSlot.answered_at !== null ||
        lastSlot.replaced_question_id
      ) {
        throw new AppError(409, 'HARD_NOT_AVAILABLE', 'The hard question is not available.');
      }
      const [[mode]] = await conn.query(
        'SELECT type_mode FROM checkpoints WHERE checkpoint_id = ?',
        [attempt.checkpoint_id],
      );
      const [[hard]] = await conn.query(DRAWABLE_QUESTIONS, [
        attempt.checkpoint_id,
        'HARD',
        typesOfMode(mode.type_mode),
        1,
      ]);
      if (!hard)
        throw new AppError(409, 'HARD_NOT_AVAILABLE', 'The hard question is not available.');
      await conn.query(
        'UPDATE attempt_questions SET replaced_question_id = question_id, question_id = ? WHERE attempt_id = ? AND question_number = ?',
        [hard.question_id, attemptId, attempt.question_count],
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
      "SELECT COUNT(*) AS higher FROM students WHERE total_points > ? AND student_id <> ? AND status = 'active' AND role = 'student'",
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
      'SELECT total_points, points_exact_x100, role FROM students WHERE student_id = ?',
      [studentId],
    );
    const rules = await loadRules(pool);
    // Total before this attempt: exact sum minus this attempt's exact points, rounded up once (R-02).
    const totalBefore = ceilDiv(
      Math.max(0, Number(student.points_exact_x100) - Number(attempt.points_exact)),
      100,
    );
    const isAdmin = student.role === 'admin';
    const [[{ passed }]] = await pool.query(
      "SELECT COUNT(*) AS passed FROM attempts WHERE student_id = ? AND checkpoint_id = ? AND status = 'passed'",
      [studentId, attempt.checkpoint_id],
    );
    const checkpoint = attempt;
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
      // Administrators are in no ranking (BR41, BR42).
      rankBefore: isAdmin ? null : await rankAmong(totalBefore, studentId),
      rankAfter: isAdmin ? null : await rankAmong(student.total_points, studentId),
      ...(isAdmin ? {} : { team: await teamStandingAround(pool, studentId, totalBefore) }),
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
