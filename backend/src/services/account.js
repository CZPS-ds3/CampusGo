// Account removal. Used by "delete my account" and by the admin area.
import { at } from '../clock.js';
import { withTransaction } from '../db/pool.js';
import { AppError, notFound } from '../middleware/errors.js';
import { recordEvent } from './audit.js';
import { repairTeam } from './teams.js';

/**
 * Repairs the team a student was just taken out of: score, order and leader, or removal when it is empty
 * (BR44, BR54). The caller has already cleared the student's team columns.
 */
export async function leaveTeam(conn, teamId, now) {
  await repairTeam(conn, teamId, now);
}

/** Removes the quiz history (answers, questions, location checks, attempts) of one student, in an order the foreign keys allow. */
export async function eraseStudentData(conn, studentId) {
  const byAttempt = 'JOIN attempts a ON a.attempt_id = x.attempt_id WHERE a.student_id = ?';
  await conn.query(`DELETE x FROM attempt_answers x ${byAttempt}`, [studentId]);
  await conn.query(`DELETE x FROM attempt_questions x ${byAttempt}`, [studentId]);
  await conn.query('DELETE FROM location_checks WHERE student_id = ?', [studentId]);
  await conn.query('DELETE FROM attempts WHERE student_id = ?', [studentId]);
}

export function createAccountService({ pool, clock }) {
  /**
   * Removes a person from the game for good (BR47): the account row, the sessions, invitations, quiz history
   * and the activity log of that person are all deleted, and the team is repaired (score, leader, or removed
   * when it is empty). Nothing is kept, so the person appears nowhere, not even as a "deleted" entry, and the
   * e-mail address is free for a new sign-up. Only a neutral log line without a name remains.
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
        'SELECT team_id, role FROM students WHERE student_id = ? FOR UPDATE',
        [studentId],
      );
      if (student.role === 'admin') {
        throw new AppError(403, 'FORBIDDEN', 'Administrator accounts cannot be deleted.');
      }
      await conn.query('DELETE FROM sessions WHERE student_id = ?', [studentId]);
      await conn.query('DELETE FROM team_invitations WHERE invitee_id = ? OR inviter_id = ?', [
        studentId,
        studentId,
      ]);
      await eraseStudentData(conn, studentId);
      await conn.query('DELETE FROM audit_events WHERE student_id = ?', [studentId]);
      await conn.query('DELETE FROM students WHERE student_id = ?', [studentId]);
      if (student.team_id) await leaveTeam(conn, student.team_id, now);
      await recordEvent(conn, now, {
        actorId,
        type: bySelf ? 'account_deleted_by_student' : 'account_deleted_by_admin',
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
      await eraseStudentData(conn, studentId);
      await conn.query(
        'UPDATE students SET total_points = 0, points_exact_x100 = 0, points_updated_at = ? WHERE student_id = ?',
        [at(now), studentId],
      );
      await recordEvent(conn, now, { studentId, type: 'points_reset' });
    });
  }

  return { deleteAccount, resetTestPoints };
}
