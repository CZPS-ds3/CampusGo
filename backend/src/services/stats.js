// Numbers for the admin dashboard. "Day" means a Europe/Berlin calendar day; the boundaries are worked out
// in Node, so no MySQL time zone tables are needed. Admins never count: every figure is about students.
import { displayName } from './auth.js';

const DAYS = 14;
const CACHE_MS = 30_000;
const ZONE = 'Europe/Berlin';

const parts = (ms) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, Number(p.value)]),
  );

const berlinOffsetMs = (ms) => {
  const p = parts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / 60000) * 60000;
};

const pad = (n) => String(n).padStart(2, '0');

/** The UTC instant at which a Berlin calendar day starts (days of 23 or 25 hours at the clock changes). */
export function berlinDayStart(year, month, day) {
  const guess = Date.UTC(year, month - 1, day);
  return guess - berlinOffsetMs(guess - berlinOffsetMs(guess));
}

/** The last `count` Berlin days ending today, oldest first, with their [start, end) in UTC milliseconds. */
export function berlinDays(nowMs, count = DAYS) {
  const today = parts(nowMs);
  const days = [];
  for (let back = count - 1; back >= -1; back -= 1) {
    const noon = Date.UTC(today.year, today.month - 1, today.day - back, 12);
    const d = new Date(noon);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const dd = d.getUTCDate();
    days.push({ date: `${y}-${pad(m)}-${pad(dd)}`, start: berlinDayStart(y, m, dd) });
  }
  return days.slice(0, -1).map((day, i) => ({ ...day, end: days[i + 1].start }));
}

export function createStatsService({ pool, clock }) {
  let cache = null;

  async function section(errors, name, work) {
    try {
      return await work();
    } catch {
      errors[name] = 'query_failed';
      return null;
    }
  }

  const bucket = (rows, field, days) =>
    days.map((day) => rows.filter((r) => r[field] >= day.start && r[field] < day.end).length);

  async function build() {
    const now = clock.now();
    const days = berlinDays(now);
    const since = new Date(days[0].start);
    const errors = {};

    const logins = await section(errors, 'daily', async () => {
      const [rows] = await pool.query(
        `SELECT e.created_at FROM audit_events e JOIN students s ON s.student_id = e.student_id
         WHERE e.event_type = 'login' AND s.role = 'student' AND e.created_at >= ?`,
        [since],
      );
      return rows.map((r) => ({ at: r.created_at.getTime() }));
    });
    const attempts = await section(errors, 'daily', async () => {
      const [rows] = await pool.query(
        `SELECT a.start_time, a.status FROM attempts a JOIN students s ON s.student_id = a.student_id
         WHERE s.role = 'student' AND a.start_time >= ?`,
        [since],
      );
      return rows.map((r) => ({ at: r.start_time.getTime(), passed: r.status === 'passed' }));
    });
    const daily =
      logins && attempts
        ? days.map((day, i) => ({
            date: day.date,
            logins: bucket(logins, 'at', days)[i],
            attempts: bucket(attempts, 'at', days)[i],
            passed: bucket(
              attempts.filter((a) => a.passed),
              'at',
              days,
            )[i],
          }))
        : null;

    const usersByStatus = await section(errors, 'usersByStatus', async () => {
      const [rows] = await pool.query(
        "SELECT status, COUNT(*) AS n FROM students WHERE role = 'student' GROUP BY status",
      );
      const counts = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
      return {
        active: counts.active ?? 0,
        blocked: counts.blocked ?? 0,
        archived: counts.archived ?? 0,
        deleted: counts.deleted ?? 0,
      };
    });

    const signedIn = await section(errors, 'signedIn', async () => {
      const [rows] = await pool.query(
        `SELECT s.first_name, s.last_name, s.nickname, x.created_at, x.last_active_at
         FROM sessions x JOIN students s ON s.student_id = x.student_id
         WHERE x.is_active = 1 AND x.expires_at > ? AND s.role = 'student' AND s.status = 'active'
         ORDER BY x.last_active_at DESC`,
        [new Date(now)],
      );
      return {
        total: rows.length,
        list: rows.slice(0, 8).map((r) => ({
          displayName: displayName(r),
          since: r.created_at.toISOString(),
          lastActiveAt: r.last_active_at.toISOString(),
        })),
      };
    });

    const checkpoints = await section(errors, 'checkpoints', async () => {
      const [rows] = await pool.query(
        `SELECT c.checkpoint_id, c.checkpoint_name, c.is_active,
           COUNT(a.attempt_id) AS attempts, COALESCE(SUM(a.status = 'passed'), 0) AS passed
         FROM checkpoints c
         LEFT JOIN (SELECT x.* FROM attempts x JOIN students s ON s.student_id = x.student_id
                    WHERE s.role = 'student') a ON a.checkpoint_id = c.checkpoint_id
         GROUP BY c.checkpoint_id ORDER BY c.checkpoint_id`,
      );
      return rows.map((r) => ({
        id: r.checkpoint_id,
        name: r.checkpoint_name,
        isActive: Boolean(r.is_active),
        attempts: Number(r.attempts),
        passed: Number(r.passed),
        passRate: Number(r.attempts) ? Number(r.passed) / Number(r.attempts) : null,
      }));
    });

    const topPlayers = await section(errors, 'topPlayers', async () => {
      const [rows] = await pool.query(
        `SELECT first_name, last_name, nickname, total_points FROM students
         WHERE role = 'student' AND status = 'active' AND total_points > 0
         ORDER BY total_points DESC, points_updated_at ASC, student_id ASC LIMIT 5`,
      );
      return rows.map((r, i) => ({
        rank: i + 1,
        displayName: displayName(r),
        points: r.total_points,
      }));
    });

    const topTeams = await section(errors, 'topTeams', async () => {
      const [rows] = await pool.query(
        `SELECT t.team_name, t.team_score, COUNT(s.student_id) AS members
         FROM teams t JOIN students s ON s.team_id = t.team_id AND s.status = 'active'
         GROUP BY t.team_id HAVING members >= 2 AND t.team_score > 0
         ORDER BY t.team_score DESC, t.score_updated_at ASC LIMIT 5`,
      );
      return rows.map((r, i) => ({
        rank: i + 1,
        name: r.team_name,
        members: Number(r.members),
        points: r.team_score,
      }));
    });

    const recent = await section(errors, 'recent', async () => {
      const [events] = await pool.query(
        `SELECT e.event_type, e.created_at, e.actor_id, e.student_id, s.first_name, s.last_name, s.nickname, s.status
         FROM audit_events e LEFT JOIN students s ON s.student_id = e.student_id
         WHERE s.role IS NULL OR s.role = 'student' ORDER BY e.created_at DESC, e.event_id DESC LIMIT 10`,
      );
      const [passes] = await pool.query(
        `SELECT a.finished_at, a.student_id, c.checkpoint_name, s.first_name, s.last_name, s.nickname, s.status
         FROM attempts a JOIN checkpoints c ON c.checkpoint_id = a.checkpoint_id
         JOIN students s ON s.student_id = a.student_id
         WHERE a.status = 'passed' AND s.role = 'student' ORDER BY a.finished_at DESC LIMIT 10`,
      );
      // Blocked, archived and deleted people are not named in the feed.
      const name = (r) => (r.status === 'active' && r.first_name ? displayName(r) : null);
      return [
        ...events.map((r) => ({
          at: r.created_at.toISOString(),
          type: r.event_type,
          byAdmin: r.actor_id !== null,
          studentId: r.status === 'active' ? r.student_id : null,
          studentName: name(r),
          checkpointName: null,
        })),
        ...passes.map((r) => ({
          at: r.finished_at.toISOString(),
          type: 'passed',
          byAdmin: false,
          studentId: r.status === 'active' ? r.student_id : null,
          studentName: name(r),
          checkpointName: r.checkpoint_name,
        })),
      ]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 10);
    });

    const today = daily?.[daily.length - 1];
    const yesterday = daily?.[daily.length - 2];
    return {
      generatedAt: new Date(now).toISOString(),
      errors,
      tiles: {
        signedInNow: signedIn?.total ?? null,
        activeStudents: usersByStatus?.active ?? null,
        loginsToday: today?.logins ?? null,
        loginsYesterday: yesterday?.logins ?? null,
        questsPassedToday: today?.passed ?? null,
        questsPassedYesterday: yesterday?.passed ?? null,
      },
      daily,
      usersByStatus,
      checkpoints,
      topPlayers,
      topTeams,
      signedIn: signedIn?.list ?? null,
      recent,
    };
  }

  /** Cached for 30 seconds; the cache is dropped at Berlin midnight because its key is the Berlin date. */
  async function getStats() {
    const now = clock.now();
    const key = berlinDays(now, 1)[0].date;
    if (cache && cache.key === key && now - cache.at < CACHE_MS) return cache.value;
    const value = await build();
    cache = { key, at: now, value };
    return value;
  }

  return { getStats };
}
