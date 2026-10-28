// Account removal. Used by "delete my account" and by the admin area.
import { at } from '../clock.js';
import { withTransaction } from '../db/pool.js';
import { notFound } from '../middleware/errors.js';
import { recordEvent } from './audit.js';
import { refreshTeamScore } from './teams.js';

export function createAccountService({ pool, clock }) {
  /**
   * Removes a person from the game: leaves the team, ends all sessions and overwrites every personal field.
   * Attempts stay (so that team and quiz data remain consistent) but the account no longer appears anywhere,
   * and its e-mail address becomes free for a new sign-up.
   */
  async function deleteAccount(studentId, { actorId = null } = {}) {
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const [[preview]] = await conn.query('SELECT team_id FROM students WHERE student_id = ?', [
        studentId,
      ]);
      if (!preview) throw notFound('Account not found.');
      // Same lock order as everywhere else: team first, then student.
      if (preview.team_id) {
        await conn.query('SELECT team_id FROM teams WHERE team_id = ? FOR UPDATE', [
          preview.team_id,
        ]);
      }
      const [[student]] = await conn.query(
        'SELECT team_id, status FROM students WHERE student_id = ? FOR UPDATE',
        [studentId],
      );
      if (student.status === 'deleted') return;
      await conn.query('UPDATE sessions SET is_active = 0 WHERE student_id = ?', [studentId]);
      await conn.query(
        "UPDATE team_invitations SET status = 'invalid', responded_at = ? WHERE (invitee_id = ? OR inviter_id = ?) AND status = 'pending'",
        [at(now), studentId, studentId],
      );
      await conn.query(
        `UPDATE students SET email = CONCAT('deleted-', student_id, '@deleted.invalid'),
           first_name = 'Deleted', last_name = 'User', nickname = NULL, profile_picture = NULL,
           avatar_preset = NULL, team_id = NULL, team_joined_at = NULL, location_consent_at = NULL,
           status = 'deleted', status_reason = NULL, reported_at = NULL, report_reason = NULL,
           deleted_at = ? WHERE student_id = ?`,
        [at(now), studentId],
      );
      if (student.team_id) {
        const [[{ left }]] = await conn.query(
          'SELECT COUNT(*) AS `left` FROM students WHERE team_id = ?',
          [student.team_id],
        );
        if (left > 0) {
          await refreshTeamScore(conn, student.team_id, now);
        } else {
          await conn.query('DELETE FROM team_invitations WHERE team_id = ?', [student.team_id]);
          await conn.query('DELETE FROM teams WHERE team_id = ?', [student.team_id]);
        }
      }
      await recordEvent(conn, now, { studentId, actorId, type: 'account_deleted' });
    });
  }

  return { deleteAccount };
}
