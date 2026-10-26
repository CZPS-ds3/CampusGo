// Loads reference data (BR11) and PLACEHOLDER checkpoints/questions. Idempotent. Usage: node seed.js
// WARNING: coordinates and questions here are placeholders for development. Before the pilot, calibrate the
// coordinates and radii on site (WBS 4.1) and replace the questions with verified ones (docs/question-bank.md).
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { createPool } from './pool.js';

export const DIFFICULTY = [
  ['NORMAL', 1000],
  ['HARD', 2000],
];
export const BONUS = [
  ['FULL_CLEAR', 200],
  ['TIME', 1],
];
export const MULTIPLIERS = [
  [1, 100],
  [2, 85],
  [3, 70],
  [4, 55],
  [5, 40],
  [6, 0],
];

// name, latitude, longitude, questionCount, passThreshold, hardEnabled  (PLACEHOLDER coordinates, about the campus area)
export const CHECKPOINTS = [
  ['Mensa', 49.1231, 9.2108, 5, 4, true],
  ['Library', 49.1236, 9.2119, 5, 4, true],
  ['CAS Cafe', 49.1228, 9.2102, 3, 2, false],
  ['Campus Garden', 49.1224, 9.2114, 3, 2, false],
  ['Care.box and Shop.box', 49.1233, 9.2096, 3, 2, false],
  ['Building B', 49.1239, 9.2106, 5, 4, true],
  ['Building C', 49.1241, 9.2115, 5, 4, true],
  ['Containers', 49.1221, 9.2121, 3, 2, false],
];
const PLACEHOLDER_RADIUS_M = 60;

/** Reference tables and the 8 pilot checkpoints. */
export async function seedReference(conn, { activateCheckpoints = true } = {}) {
  for (const [name, points] of DIFFICULTY) {
    await conn.query(
      'INSERT INTO difficulty (difficulty, points_awarded) VALUES (?, ?) ON DUPLICATE KEY UPDATE points_awarded = VALUES(points_awarded)',
      [name, points],
    );
  }
  for (const [type, points] of BONUS) {
    await conn.query(
      'INSERT INTO bonus (bonus_type, points_awarded) VALUES (?, ?) ON DUPLICATE KEY UPDATE points_awarded = VALUES(points_awarded)',
      [type, points],
    );
  }
  for (const [attempt, percentage] of MULTIPLIERS) {
    await conn.query(
      'INSERT INTO scoring_multiplier (attempt_number, percentage) VALUES (?, ?) ON DUPLICATE KEY UPDATE percentage = VALUES(percentage)',
      [attempt, percentage],
    );
  }
  for (const [name, latitude, longitude, count, threshold, hard] of CHECKPOINTS) {
    await conn.query(
      `INSERT INTO checkpoints (checkpoint_name, latitude, longitude, radius, is_active, question_count, pass_threshold, hard_question_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE question_count = VALUES(question_count), pass_threshold = VALUES(pass_threshold),
         hard_question_enabled = VALUES(hard_question_enabled)`,
      [
        name,
        latitude,
        longitude,
        PLACEHOLDER_RADIUS_M,
        activateCheckpoints ? 1 : 0,
        count,
        threshold,
        hard ? 1 : 0,
      ],
    );
  }
}

/** Placeholder question bank: 10 normal + 3 hard for large checkpoints, 6 normal for small ones (R-16). */
export async function seedPlaceholderQuestions(conn) {
  const [checkpoints] = await conn.query(
    'SELECT checkpoint_id, checkpoint_name, hard_question_enabled FROM checkpoints',
  );
  for (const checkpoint of checkpoints) {
    const [[{ count }]] = await conn.query(
      'SELECT COUNT(*) AS count FROM questions WHERE checkpoint_id = ?',
      [checkpoint.checkpoint_id],
    );
    if (count > 0) continue;
    const plan = checkpoint.hard_question_enabled
      ? [...Array(10).fill('NORMAL'), ...Array(3).fill('HARD')]
      : Array(6).fill('NORMAL');
    let index = 0;
    for (const difficulty of plan) {
      index += 1;
      const [inserted] = await conn.query(
        'INSERT INTO questions (checkpoint_id, difficulty, question_text, is_active) VALUES (?, ?, ?, 1)',
        [
          checkpoint.checkpoint_id,
          difficulty,
          `PLACEHOLDER (${difficulty.toLowerCase()} ${index}): question about ${checkpoint.checkpoint_name}?`,
        ],
      );
      const correctPosition = (index % 4) + 1;
      for (let position = 1; position <= 4; position += 1) {
        await conn.query(
          'INSERT INTO options (question_id, option_position, option_text, is_correct) VALUES (?, ?, ?, ?)',
          [
            inserted.insertId,
            position,
            `Option ${'ABCD'[position - 1]}${position === correctPosition ? ' (placeholder answer)' : ''}`,
            position === correctPosition ? 1 : 0,
          ],
        );
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  try {
    await seedReference(pool);
    await seedPlaceholderQuestions(pool);
    console.log(
      '[seed] reference data, 8 PLACEHOLDER checkpoints and placeholder questions are in place',
    );
  } catch (error) {
    console.error(`[seed] failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
