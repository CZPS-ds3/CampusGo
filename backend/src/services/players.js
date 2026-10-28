// Public player profile: what any signed-in player may see about another player.
// Never contains an e-mail address or a last name (privacy rule); names are display names.
import { at } from '../clock.js';
import { notFound } from '../middleware/errors.js';
import { displayName } from './auth.js';
import { MAX_TEAM_SIZE } from './teams.js';

export function createPlayerService({ pool, clock, boards }) {
  const person = (row) => ({
    id: row.student_id,
    displayName: displayName(row),
    pictureUrl: row.profile_picture,
    avatarPreset: row.avatar_preset,
    totalPoints: row.total_points,
  });

  async function teamStanding(team, size) {
    if (size < 2) return null;
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS better FROM (
         SELECT t.team_id FROM teams t JOIN students s ON s.team_id = t.team_id AND s.status = 'active'
         GROUP BY t.team_id HAVING COUNT(*) >= 2 AND MAX(t.team_score) > ?
       ) x`,
      [team.team_score],
    );
    return Number(row.better) + 1;
  }

  /** Whether the viewer, as a team member with a free place, may invite this player. */
  async function canInvite(viewerId, target) {
    if (target.student_id === viewerId || target.team_id) return false;
    const [[viewer]] = await pool.query('SELECT team_id FROM students WHERE student_id = ?', [
      viewerId,
    ]);
    if (!viewer?.team_id) return false;
    const [[{ size }]] = await pool.query(
      'SELECT COUNT(*) AS size FROM students WHERE team_id = ?',
      [viewer.team_id],
    );
    const [[{ pending }]] = await pool.query(
      "SELECT COUNT(*) AS pending FROM team_invitations WHERE team_id = ? AND status = 'pending' AND expires_at > ?",
      [viewer.team_id, at(clock.now())],
    );
    return Number(size) + Number(pending) < MAX_TEAM_SIZE;
  }

  async function getPlayer(viewerId, playerId) {
    const [[row]] = await pool.query(
      "SELECT * FROM students WHERE student_id = ? AND status = 'active' AND role = 'student'",
      [playerId],
    );
    if (!row) throw notFound('Player not found.');
    const [[{ cleared }]] = await pool.query(
      "SELECT COUNT(DISTINCT checkpoint_id) AS cleared FROM attempts WHERE student_id = ? AND status = 'passed'",
      [playerId],
    );
    let team = null;
    if (row.team_id) {
      const [[teamRow]] = await pool.query('SELECT * FROM teams WHERE team_id = ?', [row.team_id]);
      const [members] = await pool.query(
        `SELECT student_id, first_name, last_name, nickname, profile_picture, avatar_preset, total_points
         FROM students WHERE team_id = ? AND status = 'active' ORDER BY team_joined_at, student_id`,
        [row.team_id],
      );
      team = {
        id: teamRow.team_id,
        name: teamRow.team_name,
        pictureUrl: teamRow.profile_picture,
        score: teamRow.team_score,
        rank: await teamStanding(teamRow, members.length),
        members: members.map(person),
      };
    }
    return {
      player: {
        ...person(row),
        rank: await boards.rankOf(row.total_points),
        questsCleared: Number(cleared),
        isYou: row.student_id === viewerId,
        canInvite: await canInvite(viewerId, row),
        team,
      },
    };
  }

  return { getPlayer };
}
