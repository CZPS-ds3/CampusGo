// Teams, invitations and team scores (BR04-BR06, R-40 .. R-44, R-50, R-55).
import { at } from '../clock.js';
import { withTransaction } from '../db/pool.js';
import { AppError, notFound } from '../middleware/errors.js';
import { displayName, isSchoolEmail, normalizeEmail } from './auth.js';
import { teamScore } from './scoring.js';
import { unrankedReason } from './team-ranking.js';

export const MAX_TEAM_SIZE = 5;
export const GENERIC_INVITE_MESSAGE =
  'If the user exists and can be invited, an invitation has been sent.';

/**
 * Recomputes the cached team score. The "reached at" time only moves forward and only when the
 * rounded score changed (R-55). Must run inside the transaction that changed the members/points.
 */
export async function refreshTeamScore(conn, teamId, eventMs) {
  // Only active students count: administrators, blocked and archived people do not (BR43).
  const [members] = await conn.query(
    "SELECT total_points FROM students WHERE team_id = ? AND status = 'active' AND role = 'student'",
    [teamId],
  );
  const score = teamScore(members.map((m) => m.total_points));
  const [[team]] = await conn.query(
    'SELECT team_score, score_updated_at FROM teams WHERE team_id = ? FOR UPDATE',
    [teamId],
  );
  if (!team || team.team_score === score) return;
  const newTime = Math.max(team.score_updated_at.getTime(), eventMs);
  await conn.query('UPDATE teams SET team_score = ?, score_updated_at = ? WHERE team_id = ?', [
    score,
    at(newTime),
    teamId,
  ]);
}

export function createTeamService({ pool, config, clock, nameRules }) {
  async function expireOldInvitations(conn = pool) {
    await conn.query(
      "UPDATE team_invitations SET status = 'expired', responded_at = ? WHERE status = 'pending' AND expires_at <= ?",
      [at(clock.now()), at(clock.now())],
    );
  }

  async function getMyTeam(studentId) {
    const [[student]] = await pool.query('SELECT team_id FROM students WHERE student_id = ?', [
      studentId,
    ]);
    if (!student?.team_id) return null;
    const [[team]] = await pool.query('SELECT * FROM teams WHERE team_id = ?', [student.team_id]);
    const [members] = await pool.query(
      'SELECT student_id, first_name, last_name, nickname, profile_picture, avatar_preset, total_points FROM students WHERE team_id = ? ORDER BY team_joined_at, student_id',
      [team.team_id],
    );
    // Teammates see who is invited: the address the inviter typed, or the player's display name when the
    // invitation came from a profile page (an address nobody typed is never shown).
    const [pending] = await pool.query(
      `SELECT i.expires_at, i.invited_email, s.first_name, s.last_name, s.nickname
       FROM team_invitations i JOIN students s ON s.student_id = i.invitee_id
       WHERE i.team_id = ? AND i.status = 'pending' AND i.expires_at > ? ORDER BY i.created_at`,
      [team.team_id, at(clock.now())],
    );
    return {
      id: team.team_id,
      name: team.team_name,
      pictureUrl: team.profile_picture,
      members: members.map((m) => ({
        id: m.student_id,
        displayName: displayName(m),
        pictureUrl: m.profile_picture,
        avatarPreset: m.avatar_preset,
        totalPoints: m.total_points,
      })),
      pending: pending.map((p) => ({
        expiresAt: p.expires_at.toISOString(),
        invitedEmail: p.invited_email,
        displayName: displayName(p),
      })),
      size: members.length,
      score: team.team_score,
      active: members.length >= 2,
      // Ranked teams have two active students and no administrator (BR42).
      ranked: (await unrankedReason(pool, team.team_id)) === null,
      hasAdmin: (await unrankedReason(pool, team.team_id)) === 'admin',
    };
  }

  async function createTeam(studentId, name) {
    const now = clock.now();
    await nameRules.assertAllowed(name);
    await withTransaction(pool, async (conn) => {
      const [[student]] = await conn.query(
        'SELECT team_id, total_points FROM students WHERE student_id = ? FOR UPDATE',
        [studentId],
      );
      if (student.team_id) throw new AppError(409, 'ALREADY_IN_TEAM', 'You are already in a team.');
      const [[taken]] = await conn.query('SELECT team_id FROM teams WHERE team_name = ?', [name]);
      if (taken) throw new AppError(409, 'TEAM_NAME_TAKEN', 'This team name is already taken.');
      const [inserted] = await conn.query(
        'INSERT INTO teams (team_name, created_at, team_score, score_updated_at) VALUES (?, ?, ?, ?)',
        [name, at(now), student.total_points, at(now)],
      );
      await conn.query('UPDATE students SET team_id = ?, team_joined_at = ? WHERE student_id = ?', [
        inserted.insertId,
        at(now),
        studentId,
      ]);
      // R-44: the invitee joined a team, so all their other pending invitations become invalid.
      await conn.query(
        "UPDATE team_invitations SET status = 'invalid', responded_at = ? WHERE invitee_id = ? AND status = 'pending'",
        [at(now), studentId],
      );
    });
    return getMyTeam(studentId);
  }

  async function setTeamPicture(studentId, url) {
    const [[student]] = await pool.query('SELECT team_id FROM students WHERE student_id = ?', [
      studentId,
    ]);
    if (!student?.team_id) throw new AppError(403, 'NO_TEAM', 'You are not in a team.');
    await pool.query('UPDATE teams SET profile_picture = ? WHERE team_id = ?', [
      url,
      student.team_id,
    ]);
  }

  /** R-43: always the same outcome for the caller; invitations are only created when everything fits. */
  async function invite(inviterId, rawEmail) {
    const email = normalizeEmail(rawEmail);
    if (!isSchoolEmail(email, config.allowedEmailDomain)) {
      throw new AppError(
        400,
        'INVALID_EMAIL',
        `Please enter a school e-mail address (ending with ${config.allowedEmailDomain}).`,
      );
    }
    await createInvitation(inviterId, { email });
  }

  /** Invitation from a player's profile page: same rules, nobody's address is typed or shown. */
  const invitePlayer = (inviterId, playerId) => createInvitation(inviterId, { playerId });

  async function createInvitation(inviterId, lookup) {
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const [[inviter]] = await conn.query(
        'SELECT student_id, team_id FROM students WHERE student_id = ?',
        [inviterId],
      );
      if (!inviter.team_id) throw new AppError(403, 'NO_TEAM', 'Create a team first.');
      await expireOldInvitations(conn);
      await conn.query('SELECT team_id FROM teams WHERE team_id = ? FOR UPDATE', [inviter.team_id]);
      // Members plus open invitations may never exceed the team size. This depends only on the
      // inviter's own team, so it tells nothing about the invitee (R-43).
      const [[{ size }]] = await conn.query(
        'SELECT COUNT(*) AS size FROM students WHERE team_id = ?',
        [inviter.team_id],
      );
      const [[{ pending }]] = await conn.query(
        "SELECT COUNT(*) AS pending FROM team_invitations WHERE team_id = ? AND status = 'pending'",
        [inviter.team_id],
      );
      if (size + pending >= MAX_TEAM_SIZE) {
        throw new AppError(
          409,
          'TEAM_FULL',
          'Your team is full: members plus open invitations already make 5.',
        );
      }
      const [[invitee]] = await conn.query(
        `SELECT student_id, team_id, status, role FROM students WHERE ${
          lookup.email ? 'email' : 'student_id'
        } = ?`,
        [lookup.email ?? lookup.playerId],
      );
      if (
        !invitee ||
        invitee.status !== 'active' ||
        invitee.role !== 'student' ||
        invitee.student_id === inviterId ||
        invitee.team_id
      ) {
        return;
      }
      const [[dup]] = await conn.query(
        "SELECT invitation_id FROM team_invitations WHERE team_id = ? AND invitee_id = ? AND status = 'pending'",
        [inviter.team_id, invitee.student_id],
      );
      if (dup) return;
      await conn.query(
        'INSERT INTO team_invitations (team_id, inviter_id, invitee_id, status, created_at, expires_at, invited_email) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          inviter.team_id,
          inviterId,
          invitee.student_id,
          'pending',
          at(now),
          at(now + config.invitationTtlHours * 3600 * 1000),
          lookup.email ?? null,
        ],
      );
    });
  }

  async function listInvitations(studentId) {
    await expireOldInvitations();
    const [rows] = await pool.query(
      `SELECT i.invitation_id, i.expires_at, t.team_name, s.first_name, s.last_name, s.nickname
       FROM team_invitations i
       JOIN teams t ON t.team_id = i.team_id
       JOIN students s ON s.student_id = i.inviter_id
       WHERE i.invitee_id = ? AND i.status = 'pending' ORDER BY i.created_at`,
      [studentId],
    );
    return rows.map((r) => ({
      id: r.invitation_id,
      teamName: r.team_name,
      inviterName: displayName(r),
      expiresAt: r.expires_at.toISOString(),
      status: 'pending',
    }));
  }

  async function lockOwnPendingInvitation(conn, invitationId, studentId) {
    const [[invitation]] = await conn.query(
      'SELECT * FROM team_invitations WHERE invitation_id = ? AND invitee_id = ? FOR UPDATE',
      [invitationId, studentId],
    );
    if (!invitation) throw notFound('Invitation not found.');
    return invitation;
  }

  async function accept(studentId, invitationId) {
    const now = clock.now();
    let failure = null;
    await withTransaction(pool, async (conn) => {
      // Lock order is always team, then student, then invitation, so two simultaneous accepts cannot deadlock.
      const [[preview]] = await conn.query(
        'SELECT team_id FROM team_invitations WHERE invitation_id = ? AND invitee_id = ?',
        [invitationId, studentId],
      );
      if (!preview) throw notFound('Invitation not found.');
      await conn.query('SELECT team_id FROM teams WHERE team_id = ? FOR UPDATE', [preview.team_id]);
      const [[student]] = await conn.query(
        'SELECT team_id FROM students WHERE student_id = ? FOR UPDATE',
        [studentId],
      );
      const invitation = await lockOwnPendingInvitation(conn, invitationId, studentId);
      const invalidate = async (status) => {
        await conn.query(
          'UPDATE team_invitations SET status = ?, responded_at = ? WHERE invitation_id = ?',
          [status, at(now), invitationId],
        );
        failure = new AppError(409, 'INVITATION_INVALID', 'This invitation is no longer valid.');
      };
      if (invitation.status !== 'pending') {
        failure = new AppError(409, 'INVITATION_INVALID', 'This invitation is no longer valid.');
        return;
      }
      if (now >= invitation.expires_at.getTime()) return invalidate('expired');
      if (student.team_id) return invalidate('invalid');
      const [[{ size }]] = await conn.query(
        'SELECT COUNT(*) AS size FROM students WHERE team_id = ?',
        [invitation.team_id],
      );
      if (size >= MAX_TEAM_SIZE) return invalidate('invalid');
      await conn.query('UPDATE students SET team_id = ?, team_joined_at = ? WHERE student_id = ?', [
        invitation.team_id,
        at(now),
        studentId,
      ]);
      await conn.query(
        "UPDATE team_invitations SET status = 'accepted', responded_at = ? WHERE invitation_id = ?",
        [at(now), invitationId],
      );
      await conn.query(
        "UPDATE team_invitations SET status = 'invalid', responded_at = ? WHERE invitee_id = ? AND status = 'pending'",
        [at(now), studentId],
      );
      if (size + 1 >= MAX_TEAM_SIZE) {
        await conn.query(
          "UPDATE team_invitations SET status = 'invalid', responded_at = ? WHERE team_id = ? AND status = 'pending'",
          [at(now), invitation.team_id],
        );
      }
      await refreshTeamScore(conn, invitation.team_id, now);
    });
    if (failure) throw failure;
    return getMyTeam(studentId);
  }

  async function reject(studentId, invitationId) {
    const now = clock.now();
    let failure = null;
    await withTransaction(pool, async (conn) => {
      const invitation = await lockOwnPendingInvitation(conn, invitationId, studentId);
      if (invitation.status !== 'pending' || now >= invitation.expires_at.getTime()) {
        failure = new AppError(409, 'INVITATION_INVALID', 'This invitation is no longer valid.');
        return;
      }
      await conn.query(
        "UPDATE team_invitations SET status = 'rejected', responded_at = ? WHERE invitation_id = ?",
        [at(now), invitationId],
      );
    });
    if (failure) throw failure;
  }

  return {
    getMyTeam,
    createTeam,
    setTeamPicture,
    invite,
    invitePlayer,
    listInvitations,
    accept,
    reject,
    expireOldInvitations,
  };
}
