// Admin area: user management, activity logs, teams and name rules.
import { at } from '../clock.js';
import { withTransaction } from '../db/pool.js';
import { AppError, notFound } from '../middleware/errors.js';
import { createAccountService, eraseStudentData, leaveTeam } from './account.js';
import { recordEvent } from './audit.js';
import { displayName, mayLogIn, normalizeEmail } from './auth.js';
import { SUBSTRING_TERMS, TOKEN_TERMS } from './name-filter-terms.js';
import { createStatsService } from './stats.js';
import { MAX_TEAM_SIZE, ensureLeader, refreshTeamScore } from './teams.js';

const SETTABLE_STATUSES = ['active', 'blocked', 'archived'];
const ROLES = ['student', 'admin'];

const makeUserView = (mainAdminEmails) => (row) => ({
  id: row.student_id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  nickname: row.nickname,
  displayName: displayName(row),
  role: row.role,
  // The pre-seeded administrators cannot be demoted or deleted (BR26, BR37).
  mainAdmin: mainAdminEmails.includes(row.email),
  status: row.status,
  statusReason: row.status_reason,
  reported: Boolean(row.reported_at),
  reportReason: row.report_reason,
  teamId: row.team_id,
  teamName: row.team_name ?? null,
  totalPoints: row.total_points,
  createdAt: row.created_at.toISOString(),
  lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
  questsPassed: Number(row.quests_passed ?? 0),
});

const duplicateEmail = () =>
  new AppError(409, 'EMAIL_TAKEN', 'This e-mail address already belongs to an account.');

export function createAdminService({ pool, config, clock, nameRules }) {
  const userView = makeUserView(config.adminEmails);
  const accounts = createAccountService({ pool, clock });
  const stats = createStatsService({ pool, clock });

  const SELECT_USER = `SELECT s.*, t.team_name,
      (SELECT MAX(created_at) FROM sessions WHERE student_id = s.student_id) AS last_login_at,
      (SELECT COUNT(DISTINCT checkpoint_id) FROM attempts WHERE student_id = s.student_id AND status = 'passed') AS quests_passed
    FROM students s LEFT JOIN teams t ON t.team_id = s.team_id`;

  async function loadUser(id, conn = pool) {
    const [[row]] = await conn.query(`${SELECT_USER} WHERE s.student_id = ?`, [id]);
    if (!row) throw notFound('Account not found.');
    return row;
  }

  /** Administrators cannot be blocked, archived or deleted from the web area. */
  async function loadManageable(id, conn = pool) {
    const row = await loadUser(id, conn);
    if (row.role === 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Administrator accounts cannot be changed here.');
    }
    return row;
  }

  async function overview() {
    const now = clock.now();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const [byStatus] = await pool.query(
      "SELECT status, COUNT(*) AS n FROM students WHERE role = 'student' GROUP BY status",
    );
    const [[{ sessions }]] = await pool.query(
      'SELECT COUNT(*) AS sessions FROM sessions WHERE is_active = 1 AND expires_at > ?',
      [at(now)],
    );
    const [[{ passedToday }]] = await pool.query(
      "SELECT COUNT(*) AS passedToday FROM attempts WHERE status = 'passed' AND start_time >= ?",
      [dayStart],
    );
    const [[{ loginsToday }]] = await pool.query(
      "SELECT COUNT(*) AS loginsToday FROM audit_events WHERE event_type = 'login' AND created_at >= ?",
      [dayStart],
    );
    const [[{ teams }]] = await pool.query('SELECT COUNT(*) AS teams FROM teams');
    const [[{ admins }]] = await pool.query(
      "SELECT COUNT(*) AS admins FROM students WHERE role = 'admin'",
    );
    const counts = Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)]));
    return {
      users: {
        active: counts.active ?? 0,
        blocked: counts.blocked ?? 0,
        archived: counts.archived ?? 0,
      },
      admins: Number(admins),
      activeSessions: Number(sessions),
      questsPassedToday: Number(passedToday),
      loginsToday: Number(loginsToday),
      teams: Number(teams),
    };
  }

  async function listUsers({
    q = '',
    status = '',
    role = '',
    noTeam = false,
    limit = 100,
    offset = 0,
  } = {}) {
    const where = [];
    const params = [];
    if (q) {
      where.push(
        '(s.email LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ? OR s.nickname LIKE ?)',
      );
      const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
      params.push(like, like, like, like);
    }
    // The "add to a team" pop-up lists only people who can really be added.
    if (noTeam) where.push("s.team_id IS NULL AND s.role = 'student' AND s.status = 'active'");
    if (ROLES.includes(role)) {
      where.push('s.role = ?');
      params.push(role);
    }
    if (status === 'reported') where.push('s.reported_at IS NOT NULL');
    else if (status) {
      where.push('s.status = ?');
      params.push(status);
    }
    const [rows] = await pool.query(
      `${SELECT_USER} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY s.created_at DESC, s.student_id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return rows.map(userView);
  }

  async function getUser(id) {
    const row = await loadUser(id);
    const [sessions] = await pool.query(
      `SELECT session_id, created_at, last_active_at, expires_at, is_active FROM sessions
       WHERE student_id = ? ORDER BY created_at DESC LIMIT 30`,
      [id],
    );
    const [attempts] = await pool.query(
      `SELECT a.attempt_id, a.attempt_number, a.start_time, a.status, a.end_reason, a.points_earned, c.checkpoint_name
       FROM attempts a JOIN checkpoints c ON c.checkpoint_id = a.checkpoint_id
       WHERE a.student_id = ? ORDER BY a.start_time DESC LIMIT 50`,
      [id],
    );
    const [events] = await pool.query(
      `SELECT event_type, detail, created_at, actor_id FROM audit_events
       WHERE student_id = ? ORDER BY created_at DESC, event_id DESC LIMIT 50`,
      [id],
    );
    const now = clock.now();
    return {
      user: userView(row),
      sessions: sessions.map((s) => ({
        id: s.session_id,
        startedAt: s.created_at.toISOString(),
        lastActiveAt: s.last_active_at.toISOString(),
        active: Boolean(s.is_active) && s.expires_at.getTime() > now,
      })),
      attempts: attempts.map((a) => ({
        id: a.attempt_id,
        checkpoint: a.checkpoint_name,
        attemptNumber: a.attempt_number,
        startedAt: a.start_time.toISOString(),
        status: a.status,
        endReason: a.end_reason,
        points: a.points_earned,
      })),
      events: events.map((e) => ({
        type: e.event_type,
        detail: e.detail,
        at: e.created_at.toISOString(),
        byAdmin: e.actor_id !== null,
      })),
    };
  }

  async function checkEmail(raw, ignoreId = null) {
    const email = normalizeEmail(raw);
    if (!mayLogIn(email, config)) {
      throw new AppError(
        400,
        'INVALID_EMAIL',
        `Please use a school e-mail address (ending with ${config.allowedEmailDomain}).`,
      );
    }
    const [[taken]] = await pool.query('SELECT student_id FROM students WHERE email = ?', [email]);
    if (taken && taken.student_id !== ignoreId) throw duplicateEmail();
    return email;
  }

  async function createUser(actorId, { email, firstName, lastName, nickname, role = 'student' }) {
    const clean = await checkEmail(email);
    await nameRules.assertAllowed(firstName, lastName, nickname);
    const now = clock.now();
    try {
      const [inserted] = await pool.query(
        `INSERT INTO students (email, role, first_name, last_name, nickname, total_points, points_exact_x100, points_updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        [
          clean,
          config.adminEmails.includes(clean) ? 'admin' : role,
          firstName,
          lastName,
          nickname || null,
          at(now),
          at(now),
        ],
      );
      await recordEvent(pool, now, {
        studentId: inserted.insertId,
        actorId,
        type: 'account_created',
        detail: role === 'admin' ? 'role admin' : null,
      });
      return userView(await loadUser(inserted.insertId));
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') throw duplicateEmail();
      throw error;
    }
  }

  async function updateUser(actorId, id, patch) {
    const current = await loadManageable(id);
    const next = {
      email: patch.email === undefined ? current.email : await checkEmail(patch.email, id),
      first_name: patch.firstName ?? current.first_name,
      last_name: patch.lastName ?? current.last_name,
      nickname: patch.nickname === undefined ? current.nickname : patch.nickname || null,
    };
    await nameRules.assertAllowed(next.first_name, next.last_name, next.nickname);
    try {
      await pool.query(
        'UPDATE students SET email = ?, first_name = ?, last_name = ?, nickname = ? WHERE student_id = ?',
        [next.email, next.first_name, next.last_name, next.nickname, id],
      );
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') throw duplicateEmail();
      throw error;
    }
    await recordEvent(pool, clock.now(), { studentId: id, actorId, type: 'account_edited' });
    return userView(await loadUser(id));
  }

  async function setStatus(actorId, id, status, reason = null) {
    if (!SETTABLE_STATUSES.includes(status)) {
      throw new AppError(400, 'INVALID_INPUT', 'Unknown status.');
    }
    const current = await loadManageable(id);
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      // Team first, then student (same lock order as everywhere else).
      if (current.team_id) {
        await conn.query('SELECT team_id FROM teams WHERE team_id = ? FOR UPDATE', [
          current.team_id,
        ]);
      }
      await conn.query('UPDATE students SET status = ?, status_reason = ? WHERE student_id = ?', [
        status,
        status === 'active' ? null : reason,
        id,
      ]);
      if (status !== 'active') {
        await conn.query('UPDATE sessions SET is_active = 0 WHERE student_id = ?', [id]);
      }
      // A blocked or archived member stops counting in the team average (BR43).
      if (current.team_id) {
        await refreshTeamScore(conn, current.team_id, now);
        await ensureLeader(conn, current.team_id);
      }
      await recordEvent(conn, now, {
        studentId: id,
        actorId,
        type: `status_${status}`,
        detail: reason,
      });
    });
    return userView(await loadUser(id));
  }

  async function report(actorId, id, reason) {
    await loadManageable(id);
    const now = clock.now();
    await pool.query(
      'UPDATE students SET reported_at = ?, report_reason = ? WHERE student_id = ?',
      [at(now), reason, id],
    );
    await recordEvent(pool, now, { studentId: id, actorId, type: 'reported', detail: reason });
    return userView(await loadUser(id));
  }

  async function clearReport(actorId, id) {
    await loadManageable(id);
    await pool.query(
      'UPDATE students SET reported_at = NULL, report_reason = NULL WHERE student_id = ?',
      [id],
    );
    await recordEvent(pool, clock.now(), { studentId: id, actorId, type: 'report_cleared' });
    return userView(await loadUser(id));
  }

  async function forceLogout(actorId, id) {
    await loadManageable(id);
    await pool.query('UPDATE sessions SET is_active = 0 WHERE student_id = ?', [id]);
    await recordEvent(pool, clock.now(), { studentId: id, actorId, type: 'forced_logout' });
  }

  /** BR47: the account and everything that belongs to it is deleted for good. */
  async function deleteUser(actorId, id) {
    await loadManageable(id);
    await accounts.deleteAccount(id, { actorId });
  }

  /**
   * BR26, BR53: an admin makes a student an administrator or an administrator a student. Administrators are
   * in no team and no ranking and test with zero points, so a change in either direction takes the person out
   * of their team and clears their quiz history and points; otherwise a test pass would block the quest for the
   * new student, or real points would sit in an account that no ranking shows. The new role applies on the very
   * next request, because every request reads the role from the database.
   */
  async function setRole(actorId, id, role) {
    if (!ROLES.includes(role)) throw new AppError(400, 'INVALID_INPUT', 'Unknown role.');
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const [[preview]] = await conn.query('SELECT team_id FROM students WHERE student_id = ?', [
        id,
      ]);
      if (!preview) throw notFound('Account not found.');
      if (preview.team_id) {
        await conn.query('SELECT team_id FROM teams WHERE team_id = ? FOR UPDATE', [
          preview.team_id,
        ]);
      }
      const [[target]] = await conn.query(
        'SELECT student_id, email, role, team_id FROM students WHERE student_id = ? FOR UPDATE',
        [id],
      );
      if (target.student_id === actorId) {
        throw new AppError(403, 'FORBIDDEN', 'You cannot change your own role.');
      }
      if (config.adminEmails.includes(target.email)) {
        throw new AppError(403, 'FORBIDDEN', 'The main administrator account cannot be changed.');
      }
      if (target.role === role) return;
      await conn.query(
        "UPDATE team_invitations SET status = 'invalid', responded_at = ? WHERE (invitee_id = ? OR inviter_id = ?) AND status = 'pending'",
        [at(now), id, id],
      );
      await eraseStudentData(conn, id);
      await conn.query(
        `UPDATE students SET role = ?, team_id = NULL, team_joined_at = NULL, total_points = 0,
           points_exact_x100 = 0, points_updated_at = ? WHERE student_id = ?`,
        [role, at(now), id],
      );
      if (target.team_id) await leaveTeam(conn, target.team_id, now);
      await recordEvent(conn, now, {
        studentId: id,
        actorId,
        type: 'role_changed',
        detail: `${target.role} to ${role}`,
      });
    });
    return userView(await loadUser(id));
  }

  /** BR46: an admin puts a student into any team, for example when an invitation has expired. */
  async function addTeamMember(actorId, teamId, studentId) {
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const [[team]] = await conn.query(
        'SELECT team_id, team_name FROM teams WHERE team_id = ? FOR UPDATE',
        [teamId],
      );
      if (!team) throw notFound('Team not found.');
      const [[student]] = await conn.query(
        'SELECT student_id, role, status, team_id FROM students WHERE student_id = ? FOR UPDATE',
        [studentId],
      );
      if (!student)
        throw new AppError(404, 'STUDENT_NOT_FOUND', 'No student with this id or address.');
      if (student.role !== 'student') {
        throw new AppError(409, 'NOT_A_STUDENT', 'Administrator accounts are not added to teams.');
      }
      if (student.status !== 'active') {
        throw new AppError(
          409,
          'STUDENT_NOT_ACTIVE',
          `This account is ${student.status} and cannot join a team.`,
        );
      }
      if (student.team_id) {
        throw new AppError(409, 'ALREADY_IN_TEAM', 'This student is already in a team.');
      }
      const [[{ size }]] = await conn.query(
        'SELECT COUNT(*) AS size FROM students WHERE team_id = ?',
        [teamId],
      );
      if (Number(size) >= MAX_TEAM_SIZE) {
        throw new AppError(
          409,
          'TEAM_FULL',
          `${team.team_name} already has ${MAX_TEAM_SIZE} members.`,
        );
      }
      await conn.query('UPDATE students SET team_id = ?, team_joined_at = ? WHERE student_id = ?', [
        teamId,
        at(now),
        studentId,
      ]);
      await conn.query(
        "UPDATE team_invitations SET status = 'invalid', responded_at = ? WHERE invitee_id = ? AND status = 'pending'",
        [at(now), studentId],
      );
      await refreshTeamScore(conn, teamId, now);
      await ensureLeader(conn, teamId);
      await recordEvent(conn, now, {
        studentId,
        actorId,
        type: 'added_to_team',
        detail: team.team_name,
      });
    });
  }

  // ----- teams -----
  async function listTeams() {
    const [teams] = await pool.query(
      `SELECT t.team_id, t.team_name, t.team_score, t.created_at, COUNT(s.student_id) AS size
       FROM teams t LEFT JOIN students s ON s.team_id = t.team_id
       GROUP BY t.team_id ORDER BY t.team_score DESC, t.team_id`,
    );
    const [members] = await pool.query(
      'SELECT student_id, team_id, first_name, last_name, nickname FROM students WHERE team_id IS NOT NULL ORDER BY team_joined_at, student_id',
    );
    return teams.map((t) => ({
      id: t.team_id,
      name: t.team_name,
      score: t.team_score,
      size: Number(t.size),
      createdAt: t.created_at.toISOString(),
      members: members
        .filter((m) => m.team_id === t.team_id)
        .map((m) => ({ id: m.student_id, displayName: displayName(m) })),
    }));
  }

  async function renameTeam(actorId, teamId, name) {
    await nameRules.assertAllowed(name);
    try {
      const [res] = await pool.query('UPDATE teams SET team_name = ? WHERE team_id = ?', [
        name,
        teamId,
      ]);
      if (res.affectedRows === 0) throw notFound('Team not found.');
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        throw new AppError(409, 'TEAM_NAME_TAKEN', 'This team name is already taken.');
      }
      throw error;
    }
    await recordEvent(pool, clock.now(), {
      actorId,
      type: 'team_renamed',
      detail: `team ${teamId}`,
    });
  }

  async function removeMember(actorId, teamId, studentId) {
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const [[team]] = await conn.query('SELECT team_id FROM teams WHERE team_id = ? FOR UPDATE', [
        teamId,
      ]);
      if (!team) throw notFound('Team not found.');
      const [res] = await conn.query(
        'UPDATE students SET team_id = NULL, team_joined_at = NULL WHERE student_id = ? AND team_id = ?',
        [studentId, teamId],
      );
      if (res.affectedRows === 0) throw notFound('Member not found.');
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
      await recordEvent(conn, now, { studentId, actorId, type: 'removed_from_team' });
    });
  }

  async function deleteTeam(actorId, teamId) {
    const now = clock.now();
    await withTransaction(pool, async (conn) => {
      const [[team]] = await conn.query('SELECT team_id FROM teams WHERE team_id = ? FOR UPDATE', [
        teamId,
      ]);
      if (!team) throw notFound('Team not found.');
      await conn.query(
        'UPDATE students SET team_id = NULL, team_joined_at = NULL WHERE team_id = ?',
        [teamId],
      );
      await conn.query('DELETE FROM team_invitations WHERE team_id = ?', [teamId]);
      await conn.query('DELETE FROM teams WHERE team_id = ?', [teamId]);
      await recordEvent(conn, now, { actorId, type: 'team_deleted', detail: `team ${teamId}` });
    });
  }

  // ----- name rules -----
  async function listTerms() {
    const [custom] = await pool.query('SELECT term, mode FROM banned_terms ORDER BY term');
    return {
      builtIn: { substring: SUBSTRING_TERMS, token: TOKEN_TERMS },
      custom: custom.map((r) => ({ term: r.term, mode: r.mode })),
    };
  }

  async function addTerm(actorId, term, mode) {
    await pool.query(
      'INSERT INTO banned_terms (term, mode, created_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE mode = VALUES(mode)',
      [term, mode, at(clock.now())],
    );
    nameRules.reset();
    await recordEvent(pool, clock.now(), { actorId, type: 'term_added' });
  }

  async function removeTerm(actorId, term) {
    await pool.query('DELETE FROM banned_terms WHERE term = ?', [term]);
    nameRules.reset();
    await recordEvent(pool, clock.now(), { actorId, type: 'term_removed' });
  }

  return {
    stats: stats.getStats,
    overview,
    listUsers,
    getUser,
    createUser,
    updateUser,
    setStatus,
    report,
    clearReport,
    forceLogout,
    deleteUser,
    setRole,
    addTeamMember,
    listTeams,
    renameTeam,
    removeMember,
    deleteTeam,
    listTerms,
    addTerm,
    removeTerm,
    testName: async (text) => ({ blockedBy: await nameRules.check(text) }),
  };
}
