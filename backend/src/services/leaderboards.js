// Solo and team leaderboards (BR04, BR24, R-50 .. R-55).
import { AppError } from '../middleware/errors.js';
import { displayName } from './auth.js';
import { assignRanks } from './scoring.js';

const LIST_LIMIT = 100;

export function createLeaderboardService({ pool }) {
  const top = (entries) => entries.slice(0, LIST_LIMIT);
  const standing = (entry) => (entry ? { rank: entry.rank, points: entry.points } : null);

  async function solo(studentId) {
    const [rows] = await pool.query(
      `SELECT student_id, first_name, last_name, nickname, profile_picture, avatar_preset, total_points, points_updated_at
       FROM students ORDER BY total_points DESC, points_updated_at ASC, student_id ASC`,
    );
    const entries = assignRanks(rows.map((r) => ({ ...r, points: r.total_points }))).map((r) => ({
      rank: r.rank,
      id: r.student_id,
      displayName: displayName(r),
      pictureUrl: r.profile_picture,
      avatarPreset: r.avatar_preset,
      points: r.points,
      isYou: r.student_id === studentId,
    }));
    return { entries: top(entries), you: standing(entries.find((e) => e.isYou)) };
  }

  async function team(studentId) {
    const [[student]] = await pool.query('SELECT team_id FROM students WHERE student_id = ?', [
      studentId,
    ]);
    // BR06: only students who belong to a team may see the team board.
    if (!student?.team_id)
      throw new AppError(403, 'NO_TEAM', 'Join or create a team to see the team leaderboard.');
    const [rows] = await pool.query(
      `SELECT t.team_id, t.team_name, t.profile_picture, t.team_score, COUNT(s.student_id) AS size
       FROM teams t JOIN students s ON s.team_id = t.team_id
       GROUP BY t.team_id HAVING size >= 2
       ORDER BY t.team_score DESC, t.score_updated_at ASC, t.team_id ASC`,
    );
    const entries = assignRanks(rows.map((r) => ({ ...r, points: r.team_score }))).map((r) => ({
      rank: r.rank,
      id: r.team_id,
      name: r.team_name,
      pictureUrl: r.profile_picture,
      points: r.points,
      members: Number(r.size),
      isYourTeam: r.team_id === student.team_id,
    }));
    return { entries: top(entries), yourTeam: standing(entries.find((e) => e.isYourTeam)) };
  }

  /** Competition rank for a given total: one more than the number of students with strictly more points (R-52). */
  async function rankOf(total, conn = pool) {
    const [[row]] = await conn.query(
      'SELECT COUNT(*) AS higher FROM students WHERE total_points > ?',
      [total],
    );
    return Number(row.higher) + 1;
  }

  return { solo, team, rankOf };
}
