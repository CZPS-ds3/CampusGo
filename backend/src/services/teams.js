// Teams, invitations and team scores (BR04-BR06, R-40 .. R-44, R-50, R-55).
import { at } from '../clock.js';
import { withTransaction } from '../db/pool.js';
import { AppError, notFound } from '../middleware/errors.js';
import { recordEvent } from './audit.js';
import { displayName, isSchoolEmail, normalizeEmail } from './auth.js';
import { teamScore } from './scoring.js';
import { unrankedReason } from './team-ranking.js';

export const MAX_TEAM_SIZE = 5;
/** BR54: the order of a team (the admin can change it); the leader hand-over follows it. */
export const TEAM_ORDER = 'team_position, team_joined_at, student_id';
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

/** BR54: the place a new member takes, at the end of the team order. */
export async function nextTeamPosition(conn, teamId) {
  const [[{ last }]] = await conn.query(
    'SELECT COALESCE(MAX(team_position), 0) AS `last` FROM students WHERE team_id = ?',
    [teamId],
  );
  return Number(last) + 1;
}

/** BR54: closes the gaps after someone left, so the order is always 1, 2, 3 ... without changing who is first. */
export async function renumberTeam(conn, teamId) {
  const [members] = await conn.query(
    `SELECT student_id FROM students WHERE team_id = ? ORDER BY ${TEAM_ORDER}`,
    [teamId],
  );
  for (const [index, member] of members.entries()) {
    await conn.query('UPDATE students SET team_position = ? WHERE student_id = ?', [
      index + 1,
      member.student_id,
    ]);
  }
}

/**
 * A team always has a leader while it has members. The leader stays as long as they are still an active member;
 * otherwise the first active member in the team order takes over (BR44, BR54). Runs inside the transaction that
 * changed the members. Returns the leader id (or null).
 */
export async function ensureLeader(conn, teamId) {
  const [[team]] = await conn.query('SELECT leader_id FROM teams WHERE team_id = ?', [teamId]);
  if (!team) return;
  if (team.leader_id) {
    const [[leader]] = await conn.query(
      'SELECT team_id, status FROM students WHERE student_id = ?',
      [team.leader_id],
    );
    if (leader?.team_id === teamId && leader.status === 'active') return team.leader_id;
  }
  const [heirs] = await conn.query(
    `SELECT student_id FROM students WHERE team_id = ? AND status = 'active' ORDER BY ${TEAM_ORDER} LIMIT 1`,
    [teamId],
  );
  const heir = heirs[0]?.student_id ?? null;
  await conn.query('UPDATE teams SET leader_id = ? WHERE team_id = ?', [heir, teamId]);
  return heir;
}

/**
 * Repairs a team after someone left it (left, removed, deleted, made an admin): the score, the order and the
 * leader, or deletes the team with its invitations when nobody is left. Runs inside that transaction.
 * Returns { deleted, leaderId }.
 */
export async function repairTeam(conn, teamId, now) {
  const [[{ left }]] = await conn.query(
    'SELECT COUNT(*) AS `left` FROM students WHERE team_id = ?',
    [teamId],
  );
  if (Number(left) === 0) {
    await conn.query('DELETE FROM team_invitations WHERE team_id = ?', [teamId]);
    await conn.query('DELETE FROM teams WHERE team_id = ?', [teamId]);
    return { deleted: true, leaderId: null };
  }
  await refreshTeamScore(conn, teamId, now);
  await renumberTeam(conn, teamId);
  return { deleted: false, leaderId: await ensureLeader(conn, teamId) };
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
      `SELECT student_id, first_name, last_name, nickname, profile_picture, avatar_preset, total_points, team_position
       FROM students WHERE team_id = ? ORDER BY ${TEAM_ORDER}`,
      [team.team_id],
    );
    // Teammates see who is invited: the address the inviter typed, or the player's display name when the
    // invitation came from a profile page (an address nobody typed is never shown).
    const [pending] = await pool.query(
      `SELECT i.invitation_id, i.expires_at, i.invited_email, s.first_name, s.last_name, s.nickname
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
        position: m.team_position,
      })),
      leaderId: team.leader_id,
      pending: pending.map((p) => ({
        id: p.invitation_id,
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
        'INSERT INTO teams (team_name, leader_id, created_at, team_score, score_updated_at) VALUES (?, ?, ?, ?, ?)',
        [name, studentId, at(now), student.total_points, at(now)],
      );
      await conn.query(
        'UPDATE students SET team_id = ?, team_joined_at = ?, team_position = 1 WHERE student_id = ?',
        [inserted.insertId, at(now), studentId],
      );
      // R-44: the invitee joined a team, so all their other pending invitations become invalid.
      await conn.query(
        "UPDATE team_invitations SET status = 'invalid', responded_at = ? WHERE invitee_id = ? AND status = 'pending'",
        [at(now), studentId],
      );
    });
    return getMyTeam(studentId);
  }

  /** Sets the team picture and returns the previous one (its file can then be deleted). */
  async function setTeamPicture(studentId, url) {
    const [[student]] = await pool.query('SELECT team_id FROM students WHERE student_id = ?', [
      studentId,
    ]);
    if (!student?.team_id) throw new AppError(403, 'NO_TEAM', 'You are not in a team.');
    const [[team]] = await pool.query('SELECT profile_picture FROM teams WHERE team_id = ?', [
      student.team_id,
    ]);
    await pool.query('UPDATE teams SET profile_picture = ? WHERE team_id = ?', [
      url,
      student.team_id,
    ]);
    return team?.profile_picture ?? null;
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
      await conn.query(
        'UPDATE students SET team_id = ?, team_joined_at = ?, team_position = ? WHERE student_id = ?',
        [invitation.team_id, at(now), await nextTeamPosition(conn, invitation.team_id), studentId],
      );
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

  /** BR44: the leader (the person who created the team) removes a member. */
  async function removeMember(leaderId, targetId) {
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const [[me]] = await conn.query('SELECT team_id FROM students WHERE student_id = ?', [
        leaderId,
      ]);
      if (!me?.team_id) throw new AppError(403, 'NO_TEAM', 'You are not in a team.');
      await conn.query('SELECT team_id FROM teams WHERE team_id = ? FOR UPDATE', [me.team_id]);
      const [[team]] = await conn.query('SELECT leader_id FROM teams WHERE team_id = ?', [
        me.team_id,
      ]);
      if (team.leader_id !== leaderId) {
        throw new AppError(403, 'NOT_LEADER', 'Only the team leader can remove members.');
      }
      if (targetId === leaderId) {
        throw new AppError(400, 'CANNOT_REMOVE_LEADER', 'The leader cannot remove themselves.');
      }
      const [res] = await conn.query(
        'UPDATE students SET team_id = NULL, team_joined_at = NULL, team_position = NULL WHERE student_id = ? AND team_id = ?',
        [targetId, me.team_id],
      );
      if (res.affectedRows === 0) throw notFound('Member not found.');
      await repairTeam(conn, me.team_id, now);
      await recordEvent(conn, now, {
        studentId: targetId,
        actorId: leaderId,
        type: 'removed_from_team',
        detail: 'by the team leader',
      });
    });
    return getMyTeam(leaderId);
  }

  /**
   * BR54: any member leaves their team. When the leader leaves, the next member in the team order becomes the
   * leader; when the last member leaves, the team is deleted. Lock order: team, then student (as everywhere).
   */
  async function leave(studentId) {
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const [[preview]] = await conn.query('SELECT team_id FROM students WHERE student_id = ?', [
        studentId,
      ]);
      if (!preview?.team_id) throw new AppError(409, 'NO_TEAM', 'You are not in a team.');
      const [[team]] = await conn.query(
        'SELECT team_id, team_name, leader_id FROM teams WHERE team_id = ? FOR UPDATE',
        [preview.team_id],
      );
      const [res] = await conn.query(
        'UPDATE students SET team_id = NULL, team_joined_at = NULL, team_position = NULL WHERE student_id = ? AND team_id = ?',
        [studentId, team.team_id],
      );
      if (res.affectedRows === 0) throw new AppError(409, 'NO_TEAM', 'You are not in a team.');
      const { deleted, leaderId } = await repairTeam(conn, team.team_id, now);
      await recordEvent(conn, now, {
        studentId,
        actorId: studentId,
        type: 'left_team',
        detail: deleted ? `${team.team_name} (team deleted, nobody left)` : team.team_name,
      });
      if (!deleted && team.leader_id === studentId && leaderId) {
        await recordEvent(conn, now, {
          studentId: leaderId,
          type: 'team_leader_changed',
          detail: `${team.team_name}: the leader left`,
        });
      }
    });
    return null;
  }

  /** BR45: any member of the inviting team cancels a pending invitation. */
  async function cancelInvitation(studentId, invitationId) {
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const [[me]] = await conn.query('SELECT team_id FROM students WHERE student_id = ?', [
        studentId,
      ]);
      const [[invitation]] = await conn.query(
        'SELECT team_id, status FROM team_invitations WHERE invitation_id = ? FOR UPDATE',
        [invitationId],
      );
      if (!me?.team_id || !invitation || invitation.team_id !== me.team_id) {
        throw notFound('Invitation not found.');
      }
      if (invitation.status !== 'pending') {
        throw new AppError(409, 'INVITATION_INVALID', 'This invitation is no longer open.');
      }
      await conn.query(
        "UPDATE team_invitations SET status = 'cancelled', responded_at = ? WHERE invitation_id = ?",
        [at(now), invitationId],
      );
    });
    return getMyTeam(studentId);
  }

  return {
    leave,
    removeMember,
    cancelInvitation,
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
