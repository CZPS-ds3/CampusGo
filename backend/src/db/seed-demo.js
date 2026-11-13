// Fills the DEVELOPMENT database with believable, entirely fictional demo data: players, teams, quests
// done on several days, sessions and an activity log. Never run in production. Usage: node seed-demo.js
// All names and addresses are invented; none of them belongs to a real student.
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { scoreAttempt, teamScore, totalFromExact } from '../services/scoring.js';
import { createPool } from './pool.js';

const DAY = 24 * 3600 * 1000;
const DOMAIN = 'heilbronn.dhbw.de';

// first name, last name, nickname, avatar preset (0-5), quests passed (0-8)
const PEOPLE = [
  ['Mira', 'Okonkwo', 'Mira', 0, 8],
  ['Tomás', 'Herrera', 'Tomi', 1, 7],
  ['Aiko', 'Tanabe', 'Aiko', 2, 6],
  ['Lars', 'Nordmann', 'Lars', 3, 5],
  ['Sofia', 'Rossetti', 'Sofi', 4, 6],
  ['Dev', 'Malhotra', 'Dev', 5, 7],
  ['Chloé', 'Marchand', 'Chloé', 0, 4],
  ['Kwame', 'Boateng', 'Kwame', 1, 5],
  ['Elif', 'Yıldız', 'Elif', 2, 3],
  ['Jonas', 'Weidner', 'Jo', 3, 4],
  ['Priya', 'Nair', 'Priya', 4, 6],
  ['Mateo', 'Silva', 'Teo', 5, 5],
  ['Hana', 'Kowalska', 'Hana', 0, 3],
  ['Omar', 'Haddad', 'Omar', 1, 4],
  ['Ingrid', 'Solberg', 'Ingrid', 2, 2],
  ['Luca', 'Bianchi', 'Luca', 3, 3],
  ['Yuki', 'Hayashi', 'Yuki', 4, 2],
  ['Amara', 'Diallo', 'Amara', 5, 1],
  ['Felix', 'Brandt', 'Felix', 0, 1],
  ['Nina', 'Petrova', 'Nina', 1, 0],
  ['Rafael', 'Costa', 'Rafa', 2, 2],
  ['Sam', 'Whitfield', 'Sam', 3, 1],
  ['Zara', 'Ahmadi', 'Zara', 4, 0],
  ['Ben', 'Carver', 'Ben', 5, 1],
];

// team name, member indexes (the first one is the founder)
const TEAMS = [
  ['Bildungscampus Bandits', [0, 1, 2, 3, 4]],
  ['Mensa Mavericks', [5, 6, 7]],
  ['Garden Gnomes', [8, 9]],
  ['Container Crew', [10, 11, 12, 13]],
  ['Library Owls', [14, 15, 16]],
  ['Night Shift', [17, 18]],
];
const PENDING_INVITE = { team: 3, invitee: 19 }; // Container Crew (4) invites Nina
const BLOCKED = 21;
const ARCHIVED = 22;
const REPORTED = 23;

/** Small deterministic random generator so every run builds the same demo world. */
function rng(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const emailOf = (first, last) =>
  `${first}.${last}`
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[^a-z.]/g, '') + `@${DOMAIN}`;

async function loadRules(conn) {
  const [diff] = await conn.query('SELECT difficulty, points_awarded FROM difficulty');
  const [bonus] = await conn.query('SELECT bonus_type, points_awarded FROM bonus');
  const [mult] = await conn.query('SELECT attempt_number, percentage FROM scoring_multiplier');
  const d = Object.fromEntries(diff.map((r) => [r.difficulty, r.points_awarded]));
  const b = Object.fromEntries(bonus.map((r) => [r.bonus_type, r.points_awarded]));
  return {
    normal: d.NORMAL,
    hard: d.HARD,
    timePerSecond: b.TIME,
    fullClear: b.FULL_CLEAR,
    multipliers: new Map(mult.map((r) => [r.attempt_number, r.percentage])),
  };
}

/** Writes the demo world. Returns false when it already exists. */
export async function seedDemo(conn, now = Date.now()) {
  const [[existing]] = await conn.query('SELECT student_id FROM students WHERE email = ?', [
    emailOf(PEOPLE[0][0], PEOPLE[0][1]),
  ]);
  if (existing) return false;
  const rules = await loadRules(conn);
  // Only quests students can play now: an archived or closed quest gets no invented history.
  const [checkpoints] = await conn.query(
    'SELECT checkpoint_id, question_count, pass_threshold FROM checkpoints WHERE archived_at IS NULL AND is_active = 1 ORDER BY checkpoint_id',
  );
  const random = rng(20261027);
  const pick = (min, max) => min + Math.floor(random() * (max - min + 1));

  const people = [];
  for (const [index, [first, last, nick, avatar, passes]] of PEOPLE.entries()) {
    const joined = now - pick(3, 9) * DAY - pick(0, 20) * 3600 * 1000;
    const [inserted] = await conn.query(
      `INSERT INTO students (email, first_name, last_name, nickname, avatar_preset, total_points, points_exact_x100,
         points_updated_at, created_at, location_consent_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
      [
        emailOf(first, last),
        first,
        last,
        nick,
        avatar,
        new Date(joined),
        new Date(joined),
        new Date(joined),
      ],
    );
    const studentId = inserted.insertId;
    const order = [...checkpoints].sort(() => random() - 0.5).slice(0, passes);
    let exact = 0;
    let cursor = joined + pick(1, 6) * 3600 * 1000;
    let lastPoints = joined;
    for (const checkpoint of order) {
      const failures = random() < 0.35 ? pick(1, 2) : 0;
      for (let attemptNumber = 1; attemptNumber <= failures + 1; attemptNumber += 1) {
        const pass = attemptNumber === failures + 1;
        const count = checkpoint.question_count;
        const correct = pass
          ? random() < 0.4
            ? count
            : checkpoint.pass_threshold
          : checkpoint.pass_threshold - 1;
        const slots = Array.from({ length: count }, (_, k) => ({
          difficulty: 'NORMAL',
          correct: k < correct,
        }));
        const total = count * 60;
        const remaining = pass ? pick(8, Math.floor(total * 0.6)) : 0;
        const score = scoreAttempt({
          slots,
          questionCount: count,
          passThreshold: checkpoint.pass_threshold,
          attemptNumber,
          remainingSeconds: remaining,
          rules,
        });
        const start = cursor;
        const finish = start + (total - remaining) * 1000;
        await conn.query(
          `INSERT INTO attempts (student_id, checkpoint_id, attempt_number, start_time, expires_at, finished_at, status,
             end_reason, correct_count, base_points, time_bonus, full_clear_bonus, multiplier_percent, points_exact, points_earned,
             question_count, pass_threshold)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            studentId,
            checkpoint.checkpoint_id,
            attemptNumber,
            new Date(start),
            new Date(start + total * 1000),
            new Date(finish),
            score.passed ? 'passed' : 'failed',
            score.correctCount,
            score.basePoints,
            score.timeBonus,
            score.fullClearBonus,
            score.multiplierPercent,
            score.pointsExact,
            score.pointsEarned,
            checkpoint.question_count,
            checkpoint.pass_threshold,
          ],
        );
        exact += score.pointsExact;
        if (score.passed) lastPoints = finish;
        cursor = finish + pick(20, 160) * 60 * 1000;
      }
    }
    const loginCount = pick(2, 5);
    for (let k = 0; k < loginCount; k += 1) {
      const started = joined + Math.floor(((now - joined) * (k + 1)) / (loginCount + 1));
      const open = k === loginCount - 1 && index % 4 === 0;
      await conn.query(
        `INSERT INTO sessions (student_id, token_hash, created_at, last_active_at, expires_at, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          studentId,
          randomBytes(32).toString('hex'),
          new Date(open ? now - 12 * 60 * 1000 : started),
          new Date(open ? now - 2 * 60 * 1000 : started + 25 * 60 * 1000),
          new Date(open ? now + 28 * 60 * 1000 : started + 55 * 60 * 1000),
          open ? 1 : 0,
        ],
      );
      await conn.query(
        'INSERT INTO audit_events (student_id, event_type, created_at) VALUES (?, ?, ?)',
        [studentId, 'login', new Date(open ? now - 12 * 60 * 1000 : started)],
      );
      if (!open) {
        await conn.query(
          'INSERT INTO audit_events (student_id, event_type, created_at) VALUES (?, ?, ?)',
          [studentId, 'logout', new Date(started + 25 * 60 * 1000)],
        );
      }
    }
    const totalPoints = totalFromExact(exact);
    await conn.query(
      'UPDATE students SET total_points = ?, points_exact_x100 = ?, points_updated_at = ? WHERE student_id = ?',
      [totalPoints, exact, new Date(lastPoints), studentId],
    );
    people.push({ id: studentId, totalPoints, joined });
  }

  for (const [name, members] of TEAMS) {
    const created = Math.min(...members.map((m) => people[m].joined)) + 3600 * 1000;
    const score = teamScore(members.map((m) => people[m].totalPoints));
    // The first member created the team, so they lead it (BR44); the others follow in team order (BR54).
    const [team] = await conn.query(
      'INSERT INTO teams (team_name, leader_id, created_at, team_score, score_updated_at) VALUES (?, ?, ?, ?, ?)',
      [
        name,
        people[members[0]].id,
        new Date(created),
        score,
        new Date(now - pick(1, 40) * 3600 * 1000),
      ],
    );
    for (const [position, member] of members.entries()) {
      await conn.query(
        'UPDATE students SET team_id = ?, team_joined_at = ?, team_position = ? WHERE student_id = ?',
        [
          team.insertId,
          new Date(created + position * 1800 * 1000),
          position + 1,
          people[member].id,
        ],
      );
    }
    if (TEAMS[PENDING_INVITE.team][0] === name) {
      await conn.query(
        `INSERT INTO team_invitations (team_id, inviter_id, invitee_id, status, created_at, expires_at)
         VALUES (?, ?, ?, 'pending', ?, ?)`,
        [
          team.insertId,
          people[members[0]].id,
          people[PENDING_INVITE.invitee].id,
          new Date(now - 2 * 3600 * 1000),
          new Date(now + 22 * 3600 * 1000),
        ],
      );
    }
  }

  await conn.query(
    "UPDATE students SET status = 'blocked', status_reason = ? WHERE student_id = ?",
    ['Repeated misuse of the team names (demo)', people[BLOCKED].id],
  );
  await conn.query(
    "UPDATE students SET status = 'archived', status_reason = ? WHERE student_id = ?",
    ['Left the programme (demo)', people[ARCHIVED].id],
  );
  await conn.query('UPDATE students SET reported_at = ?, report_reason = ? WHERE student_id = ?', [
    new Date(now - 5 * 3600 * 1000),
    'Reported by another player: inappropriate profile picture (demo)',
    people[REPORTED].id,
  ]);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  if (config.nodeEnv === 'production') {
    console.error('[seed-demo] refused: demo data is for development only');
    process.exit(1);
  }
  const pool = createPool(config.databaseUrl);
  try {
    const created = await seedDemo(pool);
    console.log(
      created
        ? `[seed-demo] ${PEOPLE.length} fictional players, ${TEAMS.length} teams and their activity were added`
        : '[seed-demo] demo data already exists',
    );
  } catch (error) {
    console.error(`[seed-demo] failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
