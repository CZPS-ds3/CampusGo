// Loads reference data (BR11), the 8 pilot checkpoints and PLACEHOLDER questions. Idempotent. Usage: node seed.js
// The pilot checkpoints are created ONCE (marker `pilot_checkpoints_seeded` in app_settings). After that, quests
// belong to the admins (BR49): a later seed never brings back an erased quest, never resets the question count,
// pass mark or time limit an admin chose, and never replaces uploaded photos. Doing so used to break `npm run dev`
// (a reset question count against an admin's time limit fails the ck_checkpoint CHECK, so the API never started).
// WARNING: questions and facts are placeholders. Before the pilot, check the coordinates and radii on site
// (WBS 4.1, WP13) and replace the questions with verified ones (docs/question-bank.md).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { PILOT_SEEDED, readSetting, writeSetting } from '../services/settings.js';
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
  ['Mensa', 49.148464, 9.215808, 80, 5, 4, true, true], // OSM "Mensa Bildungscampus", Bildungscampus 8
  ['Library', 49.149493, 9.216467, 80, 5, 4, true, true], // OSM "Bib Bildungscampus", R-Bau, Bildungscampus 15
  ['CAS Cafe', 49.148951, 9.216205, 60, 3, 2, false, true], // OSM "M-Bau (DHBW CAS)", Bildungscampus 13
  ['Campus Garden', 49.147082, 9.217206, 70, 3, 2, false, true], // OSM "Campus Garden", by A-Bau (Forum)
  ['Care.box and Shop.box', 49.149088, 9.21727, 60, 3, 2, false, true], // midpoint of OSM care.box / shop.box
  ['Building B', 49.147126, 9.218486, 80, 5, 4, true, true], // OSM "B-Bau (DHBW)", Bildungscampus 4
  ['Building C', 49.147316, 9.2179, 80, 5, 4, true, true], // OSM "C-Bau (DHBW)", Bildungscampus 5
  // Not labelled in OpenStreetMap: the DHBW Sensoricum, the grey building beside the Bildungscampus car park, next to
  // Building C. Centre taken on site; confirm the radius in the WP13 tests.
  ['Sensoricum', 49.14762, 9.217807, 60, 3, 2, false, true],
];

const PILOT_NAMES = CHECKPOINTS.map(([name]) => name);

/**
 * Reference tables and the 8 pilot checkpoints. Returns the ids of the checkpoints created by this call.
 * `restore: true` (tests only) puts every pilot checkpoint back exactly as seeded, even after an admin changed it.
 */
export async function seedReference(conn, { activateCheckpoints = true, restore = false } = {}) {
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
  return seedPilotCheckpoints(conn, { activateCheckpoints, restore });
}

/** BR49: the pilot checkpoints are created once. Returns the ids created now (empty when they already were). */
export async function seedPilotCheckpoints(
  conn,
  { activateCheckpoints = true, restore = false } = {},
) {
  if (restore) {
    await restorePilotCheckpoints(conn, activateCheckpoints);
    const [rows] = await conn.query(
      'SELECT checkpoint_id FROM checkpoints WHERE checkpoint_name IN (?)',
      [PILOT_NAMES],
    );
    return rows.map((r) => r.checkpoint_id);
  }
  if ((await readSetting(conn, PILOT_SEEDED)) === 'true') return [];
  const created = [];
  for (const [name, latitude, longitude, radius, count, threshold, hard, active] of CHECKPOINTS) {
    const [result] = await conn.query(
      `INSERT IGNORE INTO checkpoints (checkpoint_name, latitude, longitude, radius, is_active, question_count, pass_threshold, hard_question_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
    if (result.affectedRows === 1) created.push(result.insertId);
  }
  await writeSetting(conn, PILOT_SEEDED, 'true');
  return created;
}

/** Tests only: every pilot checkpoint exists again with its seeded question count, pass mark and hard question. */
async function restorePilotCheckpoints(conn, activateCheckpoints) {
  for (const [index, row] of CHECKPOINTS.entries()) {
    const [name, latitude, longitude, radius, count, threshold, hard, active] = row;
    const [[existing]] = await conn.query(
      'SELECT checkpoint_id FROM checkpoints WHERE checkpoint_name = ?',
      [name],
    );
    if (existing) {
      await conn.query(
        'UPDATE checkpoints SET question_count = ?, pass_threshold = ?, hard_question_enabled = ? WHERE checkpoint_id = ?',
        [count, threshold, hard ? 1 : 0, existing.checkpoint_id],
      );
      continue;
    }
    // A test erased it: put it back under its seeded id (1 to 8) when that id is free, so the order stays the same.
    const [[taken]] = await conn.query(
      'SELECT checkpoint_id FROM checkpoints WHERE checkpoint_id = ?',
      [index + 1],
    );
    await conn.query(
      `INSERT INTO checkpoints (checkpoint_id, checkpoint_name, latitude, longitude, radius, is_active, question_count, pass_threshold, hard_question_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taken ? null : index + 1,
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

/**
 * Which checkpoints get placeholder content: the ids given (the ones the seed just created), or by default the
 * pilot checkpoints that are not archived. Quests an admin made are never filled with placeholders.
 */
async function seedTargets(conn, checkpointIds) {
  if (Array.isArray(checkpointIds)) {
    if (checkpointIds.length === 0) return [];
    const [rows] = await conn.query(
      'SELECT checkpoint_id, checkpoint_name, hard_question_enabled FROM checkpoints WHERE checkpoint_id IN (?)',
      [checkpointIds],
    );
    return rows;
  }
  const [rows] = await conn.query(
    'SELECT checkpoint_id, checkpoint_name, hard_question_enabled FROM checkpoints WHERE checkpoint_name IN (?) AND archived_at IS NULL',
    [PILOT_NAMES],
  );
  return rows;
}

/** Placeholder question bank: 10 normal + 3 hard for large checkpoints, 6 normal for small ones (R-16). */
export async function seedPlaceholderQuestions(conn, { checkpointIds } = {}) {
  const checkpoints = await seedTargets(conn, checkpointIds);
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

/**
 * Photos for the carousel (files in frontend/public/places, list in frontend/src/api/places.json). Skipped when
 * the list is missing. Only a checkpoint without any photo gets them, so photos an admin uploaded are kept.
 */
export async function seedImages(conn, { checkpointIds } = {}) {
  let places;
  try {
    places = JSON.parse(readFileSync(PLACES_JSON, 'utf8'));
  } catch {
    return;
  }
  const checkpoints = await seedTargets(conn, checkpointIds);
  for (const checkpoint of checkpoints) {
    const images = places[PLACE_SLUGS[checkpoint.checkpoint_name]] ?? [];
    const [[{ photos }]] = await conn.query(
      'SELECT COUNT(*) AS photos FROM checkpoint_images WHERE checkpoint_id = ?',
      [checkpoint.checkpoint_id],
    );
    if (Number(photos) > 0) continue;
    for (const [index, image] of images.entries()) {
      await conn.query(
        'INSERT INTO checkpoint_images (checkpoint_id, position, url, alt_text, credit) VALUES (?, ?, ?, ?, ?)',
        [checkpoint.checkpoint_id, index + 1, `/places/${image.file}`, image.alt, image.credit],
      );
    }
  }
}

/**
 * The administrator account exists from the first seed on (no sign-up step). It takes id 1 when that id is
 * free, otherwise the next id. An existing account with the address is promoted instead of duplicated.
 */
export async function seedAdmin(conn, email, name = { first: 'Study', last: 'Office' }) {
  const [[existing]] = await conn.query('SELECT student_id FROM students WHERE email = ?', [email]);
  if (existing) {
    await conn.query("UPDATE students SET role = 'admin', status = 'active' WHERE student_id = ?", [
      existing.student_id,
    ]);
    return existing.student_id;
  }
  const [[idOne]] = await conn.query('SELECT student_id FROM students WHERE student_id = 1');
  const now = new Date();
  const [inserted] = await conn.query(
    `INSERT INTO students (student_id, email, role, first_name, last_name, nickname, total_points, points_exact_x100,
       points_updated_at, created_at)
     VALUES (?, ?, 'admin', ?, ?, 'Admin', 0, 0, ?, ?)`,
    [idOne ? null : 1, email, name.first, name.last, now, now],
  );
  return inserted.insertId;
}

/**
 * BR37: every address in `ADMIN_EMAIL` gets a pre-seeded administrator account. The first one is the main admin
 * (id 1 when free); the others, such as the team's shared mailbox, are named "Campus Admin".
 */
export async function seedAdmins(conn, emails) {
  const ids = [];
  for (const [index, email] of emails.entries()) {
    const name = index === 0 ? undefined : { first: 'Campus', last: 'Admin' };
    ids.push(await seedAdmin(conn, email, name));
  }
  return ids;
}

/** Three placeholder "read first" facts per checkpoint (replace with verified texts before the pilot). */
export async function seedPlaceholderFacts(conn, { checkpointIds } = {}) {
  const checkpoints = await seedTargets(conn, checkpointIds);
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
    const created = await seedReference(pool);
    await seedPlaceholderQuestions(pool, { checkpointIds: created });
    await seedPlaceholderFacts(pool, { checkpointIds: created });
    await seedImages(pool, { checkpointIds: created });
    await seedAdmins(pool, config.adminEmails);
    console.log(
      created.length > 0
        ? `[seed] reference data and ${created.length} pilot checkpoints with placeholder content are in place`
        : '[seed] reference data is up to date (quests are managed in the admin area and left as they are)',
    );
  } catch (error) {
    console.error(`[seed] failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
