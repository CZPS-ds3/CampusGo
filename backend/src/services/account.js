// Account removal. Used by "delete my account" and by the admin area.
import { at } from '../clock.js';
import { withTransaction } from '../db/pool.js';
import { AppError, notFound } from '../middleware/errors.js';
import { recordEvent } from './audit.js';
import { ensureLeader, refreshTeamScore } from './teams.js';

/** Takes a student out of their team and repairs the team: score, leader, or removal when it is empty. */
async function leaveTeam(conn, teamId, now) {
  const [[{ left }]] = await conn.query(
    'SELECT COUNT(*) AS `left` FROM students WHERE team_id = ?',
    [teamId],
  );
  if (left > 0) {
    await refreshTeamScore(conn, teamId, now);
    await ensureLeader(conn, teamId);
  } else {
    await conn.query('DELETE FROM team_invitations WHERE team_id = ?', [teamId]);
    await conn.query('DELETE FROM teams WHERE team_id = ?', [teamId]);
  }
}

export function createAccountService({ pool, clock }) {
  /**
   * Removes a person from the game: leaves the team, ends all sessions and overwrites every personal field.
   * Attempts stay (so that team and quiz data remain consistent) but the account no longer appears anywhere,
   * and its e-mail address becomes free for a new sign-up.
   */
  async function deleteAccount(studentId, { actorId = null, bySelf = false } = {}) {
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
        'SELECT team_id, status, role, purged_at FROM students WHERE student_id = ? FOR UPDATE',
        [studentId],
      );
      if (student.role === 'admin') {
        throw new AppError(403, 'FORBIDDEN', 'Administrator accounts cannot be deleted.');
      }
      if (student.purged_at) return;
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
           deleted_at = COALESCE(deleted_at, ?), purged_at = ?, map_style = NULL WHERE student_id = ?`,
        [at(now), at(now), studentId],
      );
      if (student.team_id) await leaveTeam(conn, student.team_id, now);
      // The log keeps who erased the account and when, even though the account itself is anonymised.
      await recordEvent(conn, now, {
        studentId,
        actorId,
        type: bySelf ? 'account_deleted_by_student' : 'account_erased',
      });
    });
  }

  /**
   * Administrators only (BR41): wipes the admin's own test attempts and points so that every quiz can be
   * tried again. Nothing about it ever reaches a ranking, because administrators are in none.
   */
  async function resetTestPoints(studentId) {
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const [[student]] = await conn.query(
        'SELECT role FROM students WHERE student_id = ? FOR UPDATE',
        [studentId],
      );
      if (student?.role !== 'admin') {
        throw new AppError(403, 'FORBIDDEN', 'Only administrators can reset their points.');
      }
      await conn.query(
        `DELETE aa FROM attempt_answers aa JOIN attempts a ON a.attempt_id = aa.attempt_id
         WHERE a.student_id = ?`,
        [studentId],
      );
      await conn.query(
        `DELETE aq FROM attempt_questions aq JOIN attempts a ON a.attempt_id = aq.attempt_id
         WHERE a.student_id = ?`,
        [studentId],
      );
      await conn.query('DELETE FROM location_checks WHERE student_id = ?', [studentId]);
      await conn.query('DELETE FROM attempts WHERE student_id = ?', [studentId]);
      await conn.query(
        'UPDATE students SET total_points = 0, points_exact_x100 = 0, points_updated_at = ? WHERE student_id = ?',
        [at(now), studentId],
      );
      await recordEvent(conn, now, { studentId, type: 'points_reset' });
    });
  }

  /** BR47: an admin deletes an account softly. Nothing is erased, so it can be restored. */
  async function softDeleteAccount(studentId, { actorId }) {
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const [[preview]] = await conn.query('SELECT team_id FROM students WHERE student_id = ?', [
        studentId,
      ]);
      if (!preview) throw notFound('Account not found.');
      if (preview.team_id) {
        await conn.query('SELECT team_id FROM teams WHERE team_id = ? FOR UPDATE', [
          preview.team_id,
        ]);
      }
      const [[student]] = await conn.query(
        'SELECT team_id, status, role, purged_at FROM students WHERE student_id = ? FOR UPDATE',
        [studentId],
      );
      if (student.role === 'admin') {
        throw new AppError(403, 'FORBIDDEN', 'Administrator accounts cannot be deleted.');
      }
      if (student.status === 'deleted') {
        throw new AppError(409, 'ALREADY_DELETED', 'This account is already deleted.');
      }
      await conn.query('UPDATE sessions SET is_active = 0 WHERE student_id = ?', [studentId]);
      await conn.query(
        "UPDATE team_invitations SET status = 'invalid', responded_at = ? WHERE (invitee_id = ? OR inviter_id = ?) AND status = 'pending'",
        [at(now), studentId, studentId],
      );
      await conn.query(
        "UPDATE students SET status = 'deleted', status_reason = NULL, deleted_at = ?, team_id = NULL, team_joined_at = NULL WHERE student_id = ?",
        [at(now), studentId],
      );
      if (student.team_id) await leaveTeam(conn, student.team_id, now);
      await recordEvent(conn, now, { studentId, actorId, type: 'account_deleted_by_admin' });
    });
  }

  /** BR47: brings a softly deleted account back (an erased account cannot be restored). */
  async function restoreAccount(studentId, { actorId }) {
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const [[student]] = await conn.query(
        'SELECT status, purged_at FROM students WHERE student_id = ? FOR UPDATE',
        [studentId],
      );
      if (!student) throw notFound('Account not found.');
      if (student.status !== 'deleted') {
        throw new AppError(409, 'NOT_DELETED', 'This account is not deleted.');
      }
      if (student.purged_at) {
        throw new AppError(
          409,
          'ERASED',
          'The personal data of this account were erased, so it cannot be restored.',
        );
      }
      await conn.query(
        "UPDATE students SET status = 'active', deleted_at = NULL WHERE student_id = ?",
        [studentId],
      );
      await recordEvent(conn, now, { studentId, actorId, type: 'account_restored' });
    });
  }

  /** BR47: the admin confirmed the deletion a second time: the personal data are erased. */
  async function purgeAccount(studentId, { actorId }) {
    const [[student]] = await pool.query(
      'SELECT status, purged_at FROM students WHERE student_id = ?',
      [studentId],
    );
    if (!student) throw notFound('Account not found.');
    if (student.status !== 'deleted') {
      throw new AppError(
        409,
        'NOT_DELETED',
        'Delete the account first, then confirm the permanent deletion.',
      );
    }
    if (student.purged_at)
      throw new AppError(409, 'ERASED', 'The personal data are already erased.');
    await deleteAccount(studentId, { actorId });
  }

  return { deleteAccount, softDeleteAccount, restoreAccount, purgeAccount, resetTestPoints };
}
