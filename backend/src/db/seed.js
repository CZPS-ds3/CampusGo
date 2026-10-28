// Loads reference data (BR11), the 8 pilot checkpoints and PLACEHOLDER questions. Idempotent. Usage: node seed.js
// WARNING: questions and facts are placeholders. Before the pilot, check the coordinates and radii on site
// (WBS 4.1, WP13) and replace the questions with verified ones (docs/question-bank.md).
import { readFileSync } from 'node:fs';
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

// Bildungscampus Heilbronn (DHBW Heilbronn, Bildungscampus 4). Centres are taken from OpenStreetMap features
// with these names; radii and question counts are the starting values of the Main Project Document, section 5.
// They still need the on-site check of WP13 (two phones at the edge of every circle).
// name, latitude, longitude, radius (m), questionCount, passThreshold, hardEnabled, active
export const CHECKPOINTS = [
  ['Mensa', 49.148464, 9.215808, 60, 5, 4, true, true], // OSM "Mensa Bildungscampus", Bildungscampus 8
  ['Library', 49.149493, 9.216467, 60, 5, 4, true, true], // OSM "Bib Bildungscampus", R-Bau, Bildungscampus 15
  ['CAS Cafe', 49.148951, 9.216205, 40, 3, 2, false, true], // OSM "M-Bau (DHBW CAS)", Bildungscampus 13
  ['Campus Garden', 49.147082, 9.217206, 50, 3, 2, false, true], // OSM "Campus Garden", by A-Bau (Forum)
  ['Care.box and Shop.box', 49.149088, 9.21727, 40, 3, 2, false, true], // midpoint of OSM care.box / shop.box
  ['Building B', 49.147126, 9.218486, 60, 5, 4, true, true], // OSM "B-Bau (DHBW)", Bildungscampus 4
  ['Building C', 49.147316, 9.2179, 60, 5, 4, true, true], // OSM "C-Bau (DHBW)", Bildungscampus 5
  // Not labelled in OpenStreetMap: the DHBW Sensoricum, the grey building beside the Bildungscampus car park, next to
  // Building C. Centre taken on site; confirm the radius in the WP13 tests.
  ['Sensoricum', 49.14762, 9.217807, 40, 3, 2, false, true],
];

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
  // Existing rows keep their coordinates, radius and status: those are tuned in the database (BR08, BR11).
  for (const [name, latitude, longitude, radius, count, threshold, hard, active] of CHECKPOINTS) {
    await conn.query(
      `INSERT INTO checkpoints (checkpoint_name, latitude, longitude, radius, is_active, question_count, pass_threshold, hard_question_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         question_count = VALUES(question_count), pass_threshold = VALUES(pass_threshold),
         hard_question_enabled = VALUES(hard_question_enabled)`,
      [
        name,
        latitude,
        longitude,
        radius,
        activateCheckpoints && active ? 1 : 0,
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

const PLACE_SLUGS = {
  Mensa: 'mensa',
  Library: 'library',
  'CAS Cafe': 'cas-cafe',
  'Campus Garden': 'campus-garden',
  'Care.box and Shop.box': 'carebox-shopbox',
  'Building B': 'building-b',
  'Building C': 'building-c',
  Sensoricum: 'sensoricum',
};
const PLACES_JSON = new URL('../../../frontend/src/api/places.json', import.meta.url);

/** Photos for the carousel (files in frontend/public/places, list in frontend/src/api/places.json). Skipped when the list is missing. */
export async function seedImages(conn) {
  let places;
  try {
    places = JSON.parse(readFileSync(PLACES_JSON, 'utf8'));
  } catch {
    return;
  }
  const [checkpoints] = await conn.query('SELECT checkpoint_id, checkpoint_name FROM checkpoints');
  for (const checkpoint of checkpoints) {
    const images = places[PLACE_SLUGS[checkpoint.checkpoint_name]] ?? [];
    await conn.query('DELETE FROM checkpoint_images WHERE checkpoint_id = ?', [
      checkpoint.checkpoint_id,
    ]);
    for (const [index, image] of images.entries()) {
      await conn.query(
        'INSERT INTO checkpoint_images (checkpoint_id, position, url, alt_text, credit) VALUES (?, ?, ?, ?, ?)',
        [checkpoint.checkpoint_id, index + 1, `/places/${image.file}`, image.alt, image.credit],
      );
    }
  }
}

/** Three placeholder "read first" facts per checkpoint (replace with verified texts before the pilot). */
export async function seedPlaceholderFacts(conn) {
  const [checkpoints] = await conn.query('SELECT checkpoint_id, checkpoint_name FROM checkpoints');
  for (const checkpoint of checkpoints) {
    const [[{ count }]] = await conn.query(
      'SELECT COUNT(*) AS count FROM checkpoint_facts WHERE checkpoint_id = ?',
      [checkpoint.checkpoint_id],
    );
    if (count > 0) continue;
    for (let position = 1; position <= 3; position += 1) {
      await conn.query(
        'INSERT INTO checkpoint_facts (checkpoint_id, position, fact_text) VALUES (?, ?, ?)',
        [
          checkpoint.checkpoint_id,
          position,
          `PLACEHOLDER fact ${position} about ${checkpoint.checkpoint_name}.`,
        ],
      );
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  try {
    await seedReference(pool);
    await seedPlaceholderQuestions(pool);
    await seedPlaceholderFacts(pool);
    await seedImages(pool);
    console.log(
      '[seed] reference data, the 8 Bildungscampus checkpoints and placeholder questions are in place',
    );
  } catch (error) {
    console.error(`[seed] failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
