// Admin management of quests: the checkpoints, their photos, information and questions (BR49-BR51).
// Students only ever see what is active and ready; the quiz engine reads the same tables.
import { z } from 'zod';
import { at } from '../clock.js';
import { withTransaction } from '../db/pool.js';
import { AppError, notFound } from '../middleware/errors.js';
import { recordEvent } from './audit.js';
import { readMapLink } from './map-link.js';
import { typesOfMode } from './quiz.js';
import { deleteUpload, storeQuestPhoto } from './pictures.js';

const MAX_PHOTOS = 5;
const MAX_FACTS = 5;
const NEAR_METERS = 15;
const OPTIONS_PER_QUESTION = 4;

const text = (max) => z.string().trim().min(1).max(max);

const questSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(1000),
  mapLink: z.string().max(2000),
  radius: z.number().int().min(10).max(500),
  questionCount: z.number().int().min(1).max(10),
  passThreshold: z.number().int().min(1).max(10),
  // null: the default of one minute per question.
  timeLimitSeconds: z.number().int().min(10).max(6000).nullable(),
  hardQuestionEnabled: z.boolean(),
  typeMode: z.enum(['MCQ_ONLY', 'MULTI_ONLY', 'MIXED']),
  isActive: z.boolean(),
});

export const questSchemas = {
  create: questSchema.partial({
    description: true,
    radius: true,
    timeLimitSeconds: true,
    hardQuestionEnabled: true,
    typeMode: true,
    isActive: true,
  }),
  update: questSchema.partial(),
  facts: z.object({ facts: z.array(text(300)).max(MAX_FACTS) }),
  photo: z.object({ alt: text(200), credit: text(200) }),
  photoText: z.object({ alt: text(200).optional(), credit: text(200).optional() }),
  link: z.object({ mapLink: z.string().max(2000) }),
  question: z.object({
    questionText: text(500),
    difficulty: z.enum(['NORMAL', 'HARD']),
    questionType: z.enum(['MCQ', 'MULTI']),
    isActive: z.boolean().default(true),
    options: z
      .array(z.object({ text: text(255), isCorrect: z.boolean() }))
      .length(OPTIONS_PER_QUESTION),
  }),
};

const invalid = (message, details) => new AppError(400, 'INVALID_QUEST', message, details);

/** Right answers a question needs: one for single choice, two or three for multi-select (BR50). */
function assertOptionRules(type, options) {
  const right = options.filter((o) => o.isCorrect).length;
  if (type === 'MCQ' && right !== 1) {
    throw invalid('A multiple-choice question needs exactly one correct option.');
  }
  if (type === 'MULTI' && (right < 2 || right > 3)) {
    throw invalid('A multi-select question needs two or three correct options.');
  }
  const texts = options.map((o) => o.text.toLowerCase());
  if (new Set(texts).size !== texts.length) {
    throw invalid('The options of a question must all be different.');
  }
}

/** The rules the database also enforces, checked first so the admin gets the reason in words. */
function assertQuestRules(q) {
  if (q.passThreshold > q.questionCount) {
    throw invalid('The pass mark cannot be higher than the number of questions.');
  }
  if (q.hardQuestionEnabled && (q.questionCount < 4 || q.passThreshold > q.questionCount - 1)) {
    throw invalid(
      'A hard question needs at least 4 questions and a pass mark below the number of questions.',
    );
  }
  if (q.typeMode === 'MIXED' && q.questionCount < 3) {
    throw invalid('Both question types need at least 3 questions.');
  }
  const seconds = q.timeLimitSeconds;
  if (seconds !== null && (seconds < 10 * q.questionCount || seconds > 600 * q.questionCount)) {
    throw invalid(
      `The time limit must be between ${10 * q.questionCount} and ${600 * q.questionCount} seconds for ${q.questionCount} questions.`,
    );
  }
}

const distanceMeters = (a, b) => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

export function createCheckpointAdminService({ pool, config, clock, uploadDir, fetchImpl }) {
  const toQuest = (row) => ({
    id: row.checkpoint_id,
    name: row.checkpoint_name,
    description: row.description ?? '',
    mapUrl: row.map_url,
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    radius: row.radius,
    // The grace zone students get on top of the radius, so the admin can draw the real reach.
    graceM: config.geofenceSlackM,
    questionCount: row.question_count,
    passThreshold: row.pass_threshold,
    timeLimitSeconds: row.time_limit_seconds,
    effectiveTimeLimitSeconds:
      row.time_limit_seconds ?? row.question_count * config.secondsPerQuestion,
    hardQuestionEnabled: Boolean(row.hard_question_enabled),
    typeMode: row.type_mode,
    isActive: Boolean(row.is_active),
    archived: row.archived_at !== null,
  });

  /** What a quest still needs before students can play it, in words. */
  async function readiness(conn, quest) {
    const [rows] = await conn.query(
      `SELECT q.difficulty, q.question_type, COUNT(o.option_id) AS options, COALESCE(SUM(o.is_correct), 0) AS correct
       FROM questions q LEFT JOIN options o ON o.question_id = q.question_id
       WHERE q.checkpoint_id = ? AND q.is_active = 1 GROUP BY q.question_id`,
      [quest.id],
    );
    const drawable = rows.filter(
      (r) =>
        Number(r.options) === OPTIONS_PER_QUESTION &&
        (r.question_type === 'MCQ'
          ? Number(r.correct) === 1
          : Number(r.correct) >= 2 && Number(r.correct) <= 3),
    );
    const count = (difficulty, types) =>
      drawable.filter((r) => r.difficulty === difficulty && types.includes(r.question_type)).length;
    const allowed = typesOfMode(quest.typeMode);
    const problems = [];
    const normal = count('NORMAL', allowed);
    if (normal < quest.questionCount) {
      problems.push(
        `Needs ${quest.questionCount - normal} more normal question(s); ${quest.questionCount} are drawn for each attempt.`,
      );
    }
    if (quest.typeMode === 'MIXED') {
      if (count('NORMAL', ['MCQ']) < 1)
        problems.push('Needs at least one normal multiple-choice question.');
      if (count('NORMAL', ['MULTI']) < 1)
        problems.push('Needs at least one normal multi-select question.');
    }
    if (quest.hardQuestionEnabled && count('HARD', allowed) < 1) {
      problems.push(
        'The hard question is switched on but there is no hard question of the allowed types.',
      );
    }
    return { ready: problems.length === 0, problems };
  }

  async function summary(conn, row) {
    const quest = toQuest(row);
    const [[counts]] = await conn.query(
      `SELECT (SELECT COUNT(*) FROM questions WHERE checkpoint_id = ?) AS questions,
              (SELECT COUNT(*) FROM checkpoint_images WHERE checkpoint_id = ?) AS photos,
              (SELECT COUNT(*) FROM checkpoint_facts WHERE checkpoint_id = ?) AS facts,
              (SELECT COUNT(*) FROM attempts WHERE checkpoint_id = ?) AS attempts,
              (SELECT COUNT(*) FROM location_checks WHERE checkpoint_id = ?) AS checks`,
      [quest.id, quest.id, quest.id, quest.id, quest.id],
    );
    return {
      ...quest,
      readiness: await readiness(conn, quest),
      counts: {
        questions: Number(counts.questions),
        photos: Number(counts.photos),
        facts: Number(counts.facts),
      },
      // The same test as remove(): any attempt or location check keeps the quest (archived, not erased).
      hasHistory: Number(counts.attempts) + Number(counts.checks) > 0,
    };
  }

  async function fetchRow(conn, id, lock = false) {
    const [[row]] = await conn.query(
      `SELECT * FROM checkpoints WHERE checkpoint_id = ?${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!row) throw notFound('Quest not found.');
    return row;
  }

  async function list() {
    const [rows] = await pool.query(
      'SELECT * FROM checkpoints ORDER BY archived_at IS NOT NULL, checkpoint_id',
    );
    const quests = [];
    for (const row of rows) quests.push(await summary(pool, row));
    return quests;
  }

  async function get(id) {
    const row = await fetchRow(pool, id);
    const quest = await summary(pool, row);
    const [facts] = await pool.query(
      'SELECT fact_text FROM checkpoint_facts WHERE checkpoint_id = ? ORDER BY position',
      [id],
    );
    const [photos] = await pool.query(
      'SELECT position, url, alt_text, credit FROM checkpoint_images WHERE checkpoint_id = ? ORDER BY position',
      [id],
    );
    const [questions] = await pool.query(
      `SELECT question_id, difficulty, question_type, question_text, is_active FROM questions
       WHERE checkpoint_id = ? ORDER BY question_id`,
      [id],
    );
    const [options] = await pool.query(
      `SELECT o.question_id, o.option_id, o.option_position, o.option_text, o.is_correct FROM options o
       JOIN questions q ON q.question_id = o.question_id WHERE q.checkpoint_id = ?
       ORDER BY o.question_id, o.option_position`,
      [id],
    );
    const [questionImages] = await pool.query(
      `SELECT i.question_id, i.position, i.url, i.alt_text, i.shown FROM question_images i
       JOIN questions q ON q.question_id = i.question_id WHERE q.checkpoint_id = ?
       ORDER BY i.question_id, i.position`,
      [id],
    );
    return {
      quest,
      facts: facts.map((f) => f.fact_text),
      photos: photos.map((p) => ({
        position: p.position,
        url: p.url,
        alt: p.alt_text,
        credit: p.credit,
      })),
      questions: questions.map((q) => ({
        id: q.question_id,
        difficulty: q.difficulty,
        type: q.question_type,
        text: q.question_text,
        isActive: Boolean(q.is_active),
        options: options
          .filter((o) => o.question_id === q.question_id)
          .map((o) => ({
            id: o.option_id,
            position: o.option_position,
            text: o.option_text,
            isCorrect: Boolean(o.is_correct),
          })),
        images: questionImages
          .filter((i) => i.question_id === q.question_id)
          .map((i) => ({ position: i.position, url: i.url, alt: i.alt_text, shown: i.shown })),
      })),
    };
  }

  /** The position from a pasted link, plus a warning when another quest is almost at the same spot. */
  async function checkLink(mapLink, ignoreId = null) {
    const place = await readMapLink(mapLink, { fetchImpl });
    const [others] = await pool.query(
      'SELECT checkpoint_name, latitude, longitude FROM checkpoints WHERE archived_at IS NULL AND checkpoint_id <> ?',
      [ignoreId ?? 0],
    );
    const near = others.find(
      (o) =>
        distanceMeters(place, { lat: Number(o.latitude), lng: Number(o.longitude) }) < NEAR_METERS,
    );
    return {
      lat: place.lat,
      lng: place.lng,
      url: place.url,
      warnings: near ? [`Very close to the quest "${near.checkpoint_name}".`] : [],
    };
  }

  const duplicateName = (error) =>
    error?.code === 'ER_DUP_ENTRY'
      ? new AppError(409, 'NAME_TAKEN', 'Another quest already uses this title.')
      : error;

  async function create(actorId, input) {
    const now = clock.now();
    const merged = {
      description: '',
      radius: 35,
      timeLimitSeconds: null,
      hardQuestionEnabled: false,
      typeMode: 'MCQ_ONLY',
      isActive: false,
      ...input,
    };
    assertQuestRules(merged);
    if (merged.isActive) {
      throw invalid('A new quest has no questions yet. Add them first, then switch it on.');
    }
    const place = await checkLink(merged.mapLink);
    try {
      const id = await withTransaction(pool, async (conn) => {
        const [inserted] = await conn.query(
          `INSERT INTO checkpoints (checkpoint_name, description, map_url, longitude, latitude, radius, is_active,
             question_count, pass_threshold, time_limit_seconds, hard_question_enabled, type_mode)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
          [
            merged.name,
            merged.description,
            place.url,
            place.lng,
            place.lat,
            merged.radius,
            merged.questionCount,
            merged.passThreshold,
            merged.timeLimitSeconds,
            merged.hardQuestionEnabled ? 1 : 0,
            merged.typeMode,
          ],
        );
        await recordEvent(conn, now, {
          actorId,
          type: 'quest_created',
          detail: `Quest "${merged.name}" (#${inserted.insertId}) created.`,
        });
        return inserted.insertId;
      });
      return { ...(await get(id)), warnings: place.warnings };
    } catch (error) {
      throw duplicateName(error);
    }
  }

  async function update(actorId, id, patch) {
    const now = clock.now();
    const place = patch.mapLink === undefined ? null : await checkLink(patch.mapLink, id);
    try {
      await withTransaction(pool, async (conn) => {
        const row = await fetchRow(conn, id, true);
        if (row.archived_at) {
          throw new AppError(409, 'QUEST_ARCHIVED', 'Restore the quest before changing it.');
        }
        const current = toQuest(row);
        const next = { ...current, ...patch };
        next.timeLimitSeconds =
          patch.timeLimitSeconds === undefined ? current.timeLimitSeconds : patch.timeLimitSeconds;
        assertQuestRules(next);
        if (next.isActive) {
          const state = await readiness(conn, next);
          if (!state.ready) {
            throw new AppError(
              409,
              'QUEST_NOT_READY',
              'This quest cannot be active yet. ' + state.problems.join(' '),
              { problems: state.problems },
            );
          }
        }
        await conn.query(
          `UPDATE checkpoints SET checkpoint_name = ?, description = ?, map_url = ?, latitude = ?, longitude = ?, radius = ?,
             is_active = ?, question_count = ?, pass_threshold = ?, time_limit_seconds = ?,
             hard_question_enabled = ?, type_mode = ? WHERE checkpoint_id = ?`,
          [
            next.name,
            next.description,
            place ? place.url : current.mapUrl,
            place ? place.lat : current.lat,
            place ? place.lng : current.lng,
            next.radius,
            next.isActive ? 1 : 0,
            next.questionCount,
            next.passThreshold,
            next.timeLimitSeconds,
            next.hardQuestionEnabled ? 1 : 0,
            next.typeMode,
            id,
          ],
        );
        await recordEvent(conn, now, {
          actorId,
          type: 'quest_updated',
          detail: `Quest "${next.name}" (#${id}) updated.`,
        });
      });
    } catch (error) {
      throw duplicateName(error);
    }
    return { ...(await get(id)), warnings: place?.warnings ?? [] };
  }

  /** A quest that students played is archived (their history stays); one nobody played is erased. */
  async function remove(actorId, id) {
    const now = clock.now();
    const outcome = await withTransaction(pool, async (conn) => {
      const row = await fetchRow(conn, id, true);
      const [[used]] = await conn.query(
        `SELECT (SELECT COUNT(*) FROM attempts WHERE checkpoint_id = ?) AS attempts,
                (SELECT COUNT(*) FROM location_checks WHERE checkpoint_id = ?) AS checks`,
        [id, id],
      );
      let result = 'archived';
      let photos = [];
      if (Number(used.attempts) + Number(used.checks) === 0) {
        [photos] = await conn.query('SELECT url FROM checkpoint_images WHERE checkpoint_id = ?', [
          id,
        ]);
        await conn.query(
          'DELETE o FROM options o JOIN questions q ON q.question_id = o.question_id WHERE q.checkpoint_id = ?',
          [id],
        );
        await conn.query('DELETE FROM questions WHERE checkpoint_id = ?', [id]);
        await conn.query('DELETE FROM checkpoints WHERE checkpoint_id = ?', [id]);
        result = 'erased';
      } else {
        await conn.query(
          'UPDATE checkpoints SET is_active = 0, archived_at = ? WHERE checkpoint_id = ?',
          [at(now), id],
        );
      }
      await recordEvent(conn, now, {
        actorId,
        type: result === 'erased' ? 'quest_erased' : 'quest_archived',
        detail: `Quest "${row.checkpoint_name}" (#${id}) ${result}.`,
      });
      return { result, photos };
    });
    // The rows went with the quest (ON DELETE CASCADE); the uploaded files go once the deletion is committed.
    for (const photo of outcome.photos) await deleteFile(photo.url);
    return { result: outcome.result };
  }

  async function restore(actorId, id) {
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const row = await fetchRow(conn, id, true);
      if (!row.archived_at) throw new AppError(409, 'NOT_ARCHIVED', 'This quest is not archived.');
      await conn.query('UPDATE checkpoints SET archived_at = NULL WHERE checkpoint_id = ?', [id]);
      await recordEvent(conn, now, {
        actorId,
        type: 'quest_restored',
        detail: `Quest "${row.checkpoint_name}" (#${id}) restored (inactive).`,
      });
    });
    return get(id);
  }

  async function setFacts(actorId, id, facts) {
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const row = await fetchRow(conn, id, true);
      await conn.query('DELETE FROM checkpoint_facts WHERE checkpoint_id = ?', [id]);
      for (let i = 0; i < facts.length; i += 1) {
        await conn.query(
          'INSERT INTO checkpoint_facts (checkpoint_id, position, fact_text) VALUES (?, ?, ?)',
          [id, i + 1, facts[i]],
        );
      }
      await recordEvent(conn, now, {
        actorId,
        type: 'quest_updated',
        detail: `Information of "${row.checkpoint_name}" (#${id}) changed.`,
      });
    });
    return get(id);
  }

  async function addPhoto(actorId, id, buffer, { alt, credit }) {
    const now = clock.now();
    await fetchRow(pool, id);
    const url = await storeQuestPhoto(buffer, uploadDir);
    try {
      await withTransaction(pool, async (conn) => {
        const row = await fetchRow(conn, id, true);
        const [[{ used }]] = await conn.query(
          'SELECT COUNT(*) AS used FROM checkpoint_images WHERE checkpoint_id = ?',
          [id],
        );
        if (Number(used) >= MAX_PHOTOS) {
          throw new AppError(
            409,
            'TOO_MANY_PHOTOS',
            `A quest can have at most ${MAX_PHOTOS} photos.`,
          );
        }
        await conn.query(
          'INSERT INTO checkpoint_images (checkpoint_id, position, url, alt_text, credit) VALUES (?, ?, ?, ?, ?)',
          [id, Number(used) + 1, url, alt, credit],
        );
        await recordEvent(conn, now, {
          actorId,
          type: 'quest_updated',
          detail: `Photo added to "${row.checkpoint_name}" (#${id}).`,
        });
      });
    } catch (error) {
      await deleteFile(url);
      throw error;
    }
    return get(id);
  }

  async function updatePhoto(actorId, id, position, patch) {
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const row = await fetchRow(conn, id, true);
      const [[photo]] = await conn.query(
        'SELECT alt_text, credit FROM checkpoint_images WHERE checkpoint_id = ? AND position = ?',
        [id, position],
      );
      if (!photo) throw notFound('Photo not found.');
      await conn.query(
        'UPDATE checkpoint_images SET alt_text = ?, credit = ? WHERE checkpoint_id = ? AND position = ?',
        [patch.alt ?? photo.alt_text, patch.credit ?? photo.credit, id, position],
      );
      await recordEvent(conn, now, {
        actorId,
        type: 'quest_updated',
        detail: `Photo ${position} of "${row.checkpoint_name}" (#${id}) changed.`,
      });
    });
    return get(id);
  }

  async function removePhoto(actorId, id, position) {
    const now = clock.now();
    const url = await withTransaction(pool, async (conn) => {
      const row = await fetchRow(conn, id, true);
      const [[photo]] = await conn.query(
        'SELECT url FROM checkpoint_images WHERE checkpoint_id = ? AND position = ?',
        [id, position],
      );
      if (!photo) throw notFound('Photo not found.');
      await conn.query('DELETE FROM checkpoint_images WHERE checkpoint_id = ? AND position = ?', [
        id,
        position,
      ]);
      // Keep the positions 1..n without gaps, lowest first so a position is never used twice.
      await conn.query(
        'UPDATE checkpoint_images SET position = position - 1 WHERE checkpoint_id = ? AND position > ? ORDER BY position',
        [id, position],
      );
      await recordEvent(conn, now, {
        actorId,
        type: 'quest_updated',
        detail: `Photo removed from "${row.checkpoint_name}" (#${id}).`,
      });
      return photo.url;
    });
    await deleteFile(url);
    return get(id);
  }

  /** Removes an uploaded file. A file that is already gone is fine; any other failure is reported. */
  const deleteFile = (url) => deleteUpload(uploadDir, url);

  /** Questions that students are answering right now cannot change under them. */
  async function assertNotBeingAnswered(conn, questionId) {
    const [[row]] = await conn.query(
      `SELECT COUNT(*) AS n FROM attempt_questions aq JOIN attempts a ON a.attempt_id = aq.attempt_id
       WHERE a.status = 'active' AND (aq.question_id = ? OR aq.replaced_question_id = ?)`,
      [questionId, questionId],
    );
    if (Number(row.n) > 0) {
      throw new AppError(
        409,
        'QUESTION_IN_USE',
        'A student is answering this question right now. Try again in a few minutes.',
      );
    }
  }

  async function fetchQuestion(conn, checkpointId, questionId) {
    const [[row]] = await conn.query(
      'SELECT * FROM questions WHERE question_id = ? AND checkpoint_id = ? FOR UPDATE',
      [questionId, checkpointId],
    );
    if (!row) throw notFound('Question not found.');
    return row;
  }

  /** After a change to the questions: an active quest that can no longer be played is switched off. */
  async function guardActive(conn, now, actorId, checkpointId) {
    const row = await fetchRow(conn, checkpointId, true);
    if (!row.is_active) return false;
    const state = await readiness(conn, toQuest(row));
    if (state.ready) return false;
    await conn.query('UPDATE checkpoints SET is_active = 0 WHERE checkpoint_id = ?', [
      checkpointId,
    ]);
    await recordEvent(conn, now, {
      actorId,
      type: 'quest_deactivated',
      detail: `Quest "${row.checkpoint_name}" (#${checkpointId}) switched off: ${state.problems[0]}`,
    });
    return true;
  }

  async function saveQuestion(actorId, checkpointId, questionId, input) {
    assertOptionRules(input.questionType, input.options);
    const now = clock.now();
    const deactivated = await withTransaction(pool, async (conn) => {
      const quest = await fetchRow(conn, checkpointId, true);
      if (quest.archived_at) {
        throw new AppError(409, 'QUEST_ARCHIVED', 'Restore the quest before changing it.');
      }
      let id = questionId;
      if (id === null) {
        const [inserted] = await conn.query(
          'INSERT INTO questions (checkpoint_id, difficulty, question_type, question_text, is_active) VALUES (?, ?, ?, ?, ?)',
          [
            checkpointId,
            input.difficulty,
            input.questionType,
            input.questionText,
            input.isActive ? 1 : 0,
          ],
        );
        id = inserted.insertId;
        for (let i = 0; i < input.options.length; i += 1) {
          await conn.query(
            'INSERT INTO options (question_id, option_position, option_text, is_correct) VALUES (?, ?, ?, ?)',
            [id, i + 1, input.options[i].text, input.options[i].isCorrect ? 1 : 0],
          );
        }
      } else {
        await fetchQuestion(conn, checkpointId, id);
        await assertNotBeingAnswered(conn, id);
        await conn.query(
          'UPDATE questions SET difficulty = ?, question_type = ?, question_text = ?, is_active = ? WHERE question_id = ?',
          [input.difficulty, input.questionType, input.questionText, input.isActive ? 1 : 0, id],
        );
        // Options are changed in place so answers students already gave keep pointing at them.
        for (let i = 0; i < input.options.length; i += 1) {
          await conn.query(
            'UPDATE options SET option_text = ?, is_correct = ? WHERE question_id = ? AND option_position = ?',
            [input.options[i].text, input.options[i].isCorrect ? 1 : 0, id, i + 1],
          );
        }
      }
      await recordEvent(conn, now, {
        actorId,
        type: questionId === null ? 'question_created' : 'question_updated',
        detail: `Question #${id} of "${quest.checkpoint_name}" (#${checkpointId}) saved.`,
      });
      return guardActive(conn, now, actorId, checkpointId);
    });
    return { ...(await get(checkpointId)), deactivated };
  }

  const createQuestion = (actorId, checkpointId, input) =>
    saveQuestion(actorId, checkpointId, null, input);
  const updateQuestion = (actorId, checkpointId, questionId, input) =>
    saveQuestion(actorId, checkpointId, questionId, input);

  /** A question students answered is archived (history stays); one nobody saw is erased. */
  async function deleteQuestion(actorId, checkpointId, questionId) {
    const now = clock.now();
    const { result, deactivated } = await withTransaction(pool, async (conn) => {
      await fetchQuestion(conn, checkpointId, questionId);
      await assertNotBeingAnswered(conn, questionId);
      const [[used]] = await conn.query(
        'SELECT COUNT(*) AS n FROM attempt_questions WHERE question_id = ? OR replaced_question_id = ?',
        [questionId, questionId],
      );
      let outcome = 'archived';
      if (Number(used.n) === 0) {
        await conn.query('DELETE FROM options WHERE question_id = ?', [questionId]);
        await conn.query('DELETE FROM questions WHERE question_id = ?', [questionId]);
        outcome = 'erased';
      } else {
        await conn.query('UPDATE questions SET is_active = 0 WHERE question_id = ?', [questionId]);
      }
      await recordEvent(conn, now, {
        actorId,
        type: 'question_deleted',
        detail: `Question #${questionId} of quest #${checkpointId} ${outcome}.`,
      });
      return { result: outcome, deactivated: await guardActive(conn, now, actorId, checkpointId) };
    });
    return { ...(await get(checkpointId)), result, deactivated };
  }

  return {
    list,
    get,
    checkLink,
    create,
    update,
    remove,
    restore,
    setFacts,
    addPhoto,
    updatePhoto,
    removePhoto,
    createQuestion,
    updateQuestion,
    deleteQuestion,
  };
}
