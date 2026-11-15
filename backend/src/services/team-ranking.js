// One definition of "a team that is ranked" for every place that ranks teams (BR42, BR43).
// A ranked team has at least two active student members and no administrator member. Its score is the
// average of the active students' totals, rounded up to the next whole number. A team with an invented player of
// the demo seed is ranked only while demo players are shown (BR56).
import { assignRanks } from './scoring.js';

const MIN_RANKED_MEMBERS = 2;

/**
 * All ranked teams, best first (equal scores: the team that reached the score earlier comes first). `showDemo`
 * includes the teams of the demo seed's invented players (BR56).
 */
export async function rankedTeams(conn, { showDemo = false } = {}) {
  const [rows] = await conn.query(
    `SELECT t.team_id, t.team_name, t.profile_picture, t.team_score, t.score_updated_at,
            SUM(s.status = 'active' AND s.role = 'student') AS size
     FROM teams t JOIN students s ON s.team_id = t.team_id
     GROUP BY t.team_id
     HAVING SUM(s.role = 'admin') = 0 AND SUM(s.status = 'active' AND s.role = 'student') >= ?
       AND (? OR SUM(s.is_demo) = 0)
     ORDER BY t.team_score DESC, t.score_updated_at ASC, t.team_id ASC`,
    [MIN_RANKED_MEMBERS, showDemo],
  );
  return assignRanks(rows.map((r) => ({ ...r, size: Number(r.size), points: r.team_score })));
}

/** Rank of one team among the ranked teams, or null when the team is not ranked. */
export async function rankOfTeam(conn, teamId, { showDemo = false } = {}) {
  const entry = (await rankedTeams(conn, { showDemo })).find((team) => team.team_id === teamId);
  return entry ? entry.rank : null;
}

/** Why a team is not ranked: 'admin' (an administrator is a member), 'small' (fewer than two students) or null. */
export async function unrankedReason(conn, teamId) {
  const [[row]] = await conn.query(
    `SELECT SUM(role = 'admin') AS admins, SUM(status = 'active' AND role = 'student') AS students
     FROM students WHERE team_id = ?`,
    [teamId],
  );
  if (Number(row.admins) > 0) return 'admin';
  return Number(row.students) < MIN_RANKED_MEMBERS ? 'small' : null;
}

/**
 * Team standing around one student's result: the team score and rank before and after the student's last
 * attempt. Null when the student is not a student or the team is not ranked.
 */
export async function teamStandingAround(conn, studentId, totalBefore, { showDemo = false } = {}) {
  const [[me]] = await conn.query(
    'SELECT team_id, role, total_points FROM students WHERE student_id = ?',
    [studentId],
  );
  if (!me?.team_id || me.role !== 'student') return null;
  const teams = await rankedTeams(conn, { showDemo });
  const own = teams.find((team) => team.team_id === me.team_id);
  if (!own) return null;
  const [members] = await conn.query(
    "SELECT student_id, total_points FROM students WHERE team_id = ? AND status = 'active' AND role = 'student'",
    [me.team_id],
  );
  const sumBefore = members.reduce(
    (n, m) => n + (m.student_id === studentId ? totalBefore : m.total_points),
    0,
  );
  const scoreBefore = Math.floor((sumBefore + members.length - 1) / members.length);
  const others = teams.filter((team) => team.team_id !== me.team_id);
  const rankWith = (score) => 1 + others.filter((team) => team.team_score > score).length;
  return {
    teamName: own.team_name,
    teamScoreBefore: scoreBefore,
    teamScoreAfter: own.team_score,
    teamRankBefore: rankWith(scoreBefore),
    teamRankAfter: rankWith(own.team_score),
  };
}
