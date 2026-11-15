// Public player profile: what any signed-in player may see about another player.
// Never contains an e-mail address or a last name (privacy rule); names are display names.
import { at } from '../clock.js';
import { notFound } from '../middleware/errors.js';
import { displayName } from './auth.js';
import { realPlayers } from './demo.js';
import { rankOfTeam } from './team-ranking.js';
import { MAX_TEAM_SIZE, TEAM_ORDER } from './teams.js';

export function createPlayerService({ pool, clock, boards, settings }) {
  const person = (row) => ({
    id: row.student_id,
    displayName: displayName(row),
    pictureUrl: row.profile_picture,
    avatarPreset: row.avatar_preset,
    totalPoints: row.total_points,
  });

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
    const showDemo = await settings.showDemo();
    // BR56: a hidden demo player has no profile either.
    const [[row]] = await pool.query(
      `SELECT * FROM students s
       WHERE student_id = ? AND status = 'active' AND role = 'student' AND ${realPlayers(showDemo)}`,
      [playerId],
    );
    if (!row) throw notFound('Player not found.');
    const [[{ cleared }]] = await pool.query(
      "SELECT COUNT(DISTINCT a.checkpoint_id) AS cleared FROM attempts a JOIN checkpoints c ON c.checkpoint_id = a.checkpoint_id WHERE a.student_id = ? AND a.status = 'passed' AND c.archived_at IS NULL",
      [playerId],
    );
    let team = null;
    if (row.team_id) {
      const [[teamRow]] = await pool.query('SELECT * FROM teams WHERE team_id = ?', [row.team_id]);
      const [members] = await pool.query(
        `SELECT student_id, first_name, last_name, nickname, profile_picture, avatar_preset, total_points
         FROM students WHERE team_id = ? AND status = 'active' ORDER BY ${TEAM_ORDER}`,
        [row.team_id],
      );
      team = {
        id: teamRow.team_id,
        name: teamRow.team_name,
        pictureUrl: teamRow.profile_picture,
        score: teamRow.team_score,
        rank: await rankOfTeam(pool, teamRow.team_id, { showDemo }),
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
