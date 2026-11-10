// OTP login, sign-up and sessions (BR01-BR03, R-30 .. R-36).
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { at } from '../clock.js';
import { withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/errors.js';
import { recordEvent } from './audit.js';

export const GENERIC_OTP_MESSAGE =
  'If the account exists, an email containing the OTP has been sent.';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Normalises an e-mail: trimmed, lower-case (R-31). */
export const normalizeEmail = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

/**
 * R-31: exactly one "@", at most 254 characters, local part 1-64 characters without whitespace/control
 * characters, and the address must END with the school domain (preceded by "@" or ".").
 */
/**
 * BR01 + BR37: students need a school address; only the pre-seeded administrator addresses (`ADMIN_EMAIL`) may
 * use another domain, so the team's shared admin mailbox can log in too.
 */
export const mayLogIn = (email, config) =>
  isSchoolEmail(email, config.allowedEmailDomain) || config.adminEmails.includes(email);

export function isSchoolEmail(email, domain) {
  if (email.length > 254) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, host] = parts;
  // eslint-disable-next-line no-control-regex
  if (local.length < 1 || local.length > 64 || /[\s\u0000-\u001f\u007f]/.test(local)) return false;
  return new RegExp(`^([a-z0-9-]+\\.)*${escapeRegex(domain)}$`).test(host);
}

export const displayName = (row) =>
  row.nickname
    ? row.nickname
    : `${row.first_name} ${String(row.last_name).charAt(0).toUpperCase()}.`;

export function publicStudent(row) {
  return {
    id: row.student_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    nickname: row.nickname,
    displayName: displayName(row),
    pictureUrl: row.profile_picture,
    avatarPreset: row.avatar_preset,
    role: row.role,
    totalPoints: row.total_points,
    teamId: row.team_id,
    locationConsent: Boolean(row.location_consent_at),
  };
}

/** The login e-mail. `code` is six digits and `ttlMinutes` a number, so nothing here needs HTML escaping. */
export function otpEmail(to, code, ttlMinutes) {
  return {
    to,
    subject: 'Your DHBW campusGO login code',
    text: `Your one-time code is ${code}. It is valid for ${ttlMinutes} minutes.\nIf you did not ask for it, ignore this message.`,
    html:
      '<div style="font-family:Arial,sans-serif;font-size:16px;color:#1a1a1a">' +
      '<p>Your DHBW campusGO login code:</p>' +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>` +
      `<p>It is valid for ${ttlMinutes} minutes. Never share it with anyone.</p>` +
      '<p style="color:#666;font-size:13px">If you did not ask for it, ignore this message.</p></div>',
  };
}

// BR52: at most this many codes are kept for the test inbox at once (oldest dropped first).
const PREVIEW_LIMIT = 500;

export function createAuthService({ pool, config, mailer, clock, nameRules, settings }) {
  // BR52 code preview: the code that was e-mailed, kept in memory only (never in the database, which holds hashes).
  const previews = new Map();
  const hashCode = (email, code) =>
    createHmac('sha256', config.otpSecret).update(`${email}:${code}`).digest('hex');
  const hashToken = (token) => createHash('sha256').update(token).digest('hex');
  const sameHash = (a, b) =>
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

  /** R-32/R-33: always returns normally; sending, throttling and "no such account" look identical. */
  async function requestOtp(rawEmail) {
    const email = normalizeEmail(rawEmail);
    if (!mayLogIn(email, config)) {
      throw new AppError(
        400,
        'INVALID_EMAIL',
        `Please use your school e-mail address (ending with ${config.allowedEmailDomain}).`,
      );
    }
    const now = clock.now();
    const [[latest]] = await pool.query(
      'SELECT created_at FROM otp_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1',
      [email],
    );
    if (latest && now - latest.created_at.getTime() < config.otpResendCooldownSeconds * 1000)
      return;
    const [[{ lastHour }]] = await pool.query(
      'SELECT COUNT(*) AS lastHour FROM otp_codes WHERE email = ? AND created_at > ?',
      [email, at(now - 3600 * 1000)],
    );
    if (lastHour >= config.otpResendMaxPerHour) return;

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await withTransaction(pool, async (conn) => {
      await conn.query('UPDATE otp_codes SET is_used = 1 WHERE email = ? AND is_used = 0', [email]);
      await conn.query(
        'INSERT INTO otp_codes (email, code_hash, created_at, expires_at, is_used, failed_attempts) VALUES (?, ?, ?, ?, 0, 0)',
        [email, hashCode(email, code), at(now), at(now + config.otpTtlMinutes * 60 * 1000)],
      );
    });
    const preview = settings ? await settings.otpPreview() : false;
    if (preview) rememberPreview(email, code, now);
    // Real e-mail whenever SMTP is set up. Without SMTP but with the preview on, the test inbox is the delivery.
    if (mailer.configured !== false || !preview) {
      mailer.send(otpEmail(email, code, config.otpTtlMinutes));
    }
  }

  function rememberPreview(email, code, now) {
    previews.delete(email);
    previews.set(email, { code, expiresAt: now + config.otpTtlMinutes * 60 * 1000 });
    while (previews.size > PREVIEW_LIMIT) previews.delete(previews.keys().next().value);
    // Development helper on purpose (BR52): only while an admin has the preview switched on.
    if (!config.isTest) console.log(`[mail:preview] login code for ${email}: ${code}`);
  }

  /**
   * BR52: the code that was e-mailed last, for the test inbox of the login page. Only while the admin switch is
   * on, and only while that code is still the valid one (the newest unused, unexpired code of the address).
   */
  async function previewCode(rawEmail) {
    if (!settings || !(await settings.otpPreview())) {
      throw new AppError(404, 'PREVIEW_OFF', 'The code preview is switched off.');
    }
    const email = normalizeEmail(rawEmail);
    const now = clock.now();
    const entry = previews.get(email);
    const noCode = new AppError(404, 'NO_CODE', 'No code was sent yet. Press "Resend code".');
    if (!entry || entry.expiresAt <= now) throw noCode;
    const [[otp]] = await pool.query(
      'SELECT code_hash FROM otp_codes WHERE email = ? AND is_used = 0 AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
      [email, at(now)],
    );
    if (!otp || !sameHash(otp.code_hash, hashCode(email, entry.code))) throw noCode;
    return entry.code;
  }

  async function createSession(conn, studentId, now) {
    await conn.query('UPDATE sessions SET is_active = 0 WHERE student_id = ? AND is_active = 1', [
      studentId,
    ]);
    const token = randomBytes(32).toString('hex');
    await conn.query(
      'INSERT INTO sessions (student_id, token_hash, created_at, last_active_at, expires_at, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      [
        studentId,
        hashToken(token),
        at(now),
        at(now),
        at(now + config.sessionInactivityMinutes * 60 * 1000),
      ],
    );
    return token;
  }

  /**
   * R-34. Returns { status: 'profile_required' } or { status: 'ok', created, token, student }.
   * A wrong, expired, used or locked code always gives the same INVALID_CODE error.
   */
  async function verifyOtp(rawEmail, rawCode, profile) {
    const email = normalizeEmail(rawEmail);
    if (!mayLogIn(email, config)) {
      throw new AppError(400, 'INVALID_CODE', 'Invalid or expired code.');
    }
    const code = String(rawCode ?? '').replace(/\s+/g, '');
    const now = clock.now();
    return withTransaction(pool, async (conn) => {
      const [[otp]] = await conn.query(
        'SELECT * FROM otp_codes WHERE email = ? AND is_used = 0 AND expires_at > ? ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
        [email, at(now)],
      );
      if (!otp || otp.failed_attempts >= config.otpMaxFailedAttempts) {
        throw new AppError(400, 'INVALID_CODE', 'Invalid or expired code.');
      }
      const right = /^\d{6}$/.test(code) && sameHash(otp.code_hash, hashCode(email, code));
      if (!right) {
        await conn.query(
          'UPDATE otp_codes SET failed_attempts = failed_attempts + 1 WHERE otp_id = ?',
          [otp.otp_id],
        );
        await conn.commit(); // keep the counter even though we throw
        await conn.beginTransaction();
        throw new AppError(400, 'INVALID_CODE', 'Invalid or expired code.');
      }

      const [[existing]] = await conn.query('SELECT * FROM students WHERE email = ? FOR UPDATE', [
        email,
      ]);
      if (existing && existing.status !== 'active') {
        throw new AppError(
          403,
          'ACCOUNT_UNAVAILABLE',
          'This account cannot be used. Please contact the study office.',
        );
      }
      let student = existing;
      let created = false;
      const isAdminEmail = config.adminEmails.includes(email);
      if (!student) {
        if (!profile?.firstName || !profile?.lastName) return { status: 'profile_required' }; // OTP stays usable
        await nameRules.assertAllowed(profile.firstName, profile.lastName, profile.nickname);
        const [inserted] = await conn.query(
          `INSERT INTO students (email, role, first_name, last_name, nickname, avatar_preset, total_points, points_exact_x100, points_updated_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
          [
            email,
            isAdminEmail ? 'admin' : 'student',
            profile.firstName,
            profile.lastName,
            profile.nickname ?? null,
            profile.avatarPreset ?? null,
            at(now),
            at(now),
          ],
        );
        const [[row]] = await conn.query('SELECT * FROM students WHERE student_id = ?', [
          inserted.insertId,
        ]);
        student = row;
        created = true;
      }
      if (isAdminEmail && student.role !== 'admin') {
        await conn.query("UPDATE students SET role = 'admin' WHERE student_id = ?", [
          student.student_id,
        ]);
        student = { ...student, role: 'admin' };
      }
      await conn.query('UPDATE otp_codes SET is_used = 1 WHERE otp_id = ?', [otp.otp_id]);
      previews.delete(email);
      const token = await createSession(conn, student.student_id, now);
      await recordEvent(conn, now, { studentId: student.student_id, type: 'login' });
      return { status: 'ok', created, token, student: publicStudent(student) };
    });
  }

  /** Returns the student row for a valid session token (and extends the inactivity window), or null (R-35). */
  async function authenticate(token) {
    if (!token || typeof token !== 'string') return null;
    const now = clock.now();
    const [[session]] = await pool.query(
      'SELECT session_id, student_id FROM sessions WHERE token_hash = ? AND is_active = 1 AND expires_at > ?',
      [hashToken(token), at(now)],
    );
    if (!session) return null;
    await pool.query(
      'UPDATE sessions SET last_active_at = ?, expires_at = ? WHERE session_id = ?',
      [at(now), at(now + config.sessionInactivityMinutes * 60 * 1000), session.session_id],
    );
    const [[student]] = await pool.query('SELECT * FROM students WHERE student_id = ?', [
      session.student_id,
    ]);
    // A blocked, archived or deleted account loses its session at once.
    if (student && student.status !== 'active') {
      await pool.query('UPDATE sessions SET is_active = 0 WHERE session_id = ?', [
        session.session_id,
      ]);
      return null;
    }
    return student ?? null;
  }

  async function logout(token) {
    if (!token) return;
    const [[session]] = await pool.query(
      'SELECT student_id FROM sessions WHERE token_hash = ? AND is_active = 1',
      [hashToken(token)],
    );
    await pool.query('UPDATE sessions SET is_active = 0 WHERE token_hash = ?', [hashToken(token)]);
    if (session) {
      await recordEvent(pool, clock.now(), { studentId: session.student_id, type: 'logout' });
    }
  }

  async function purgeOldOtps() {
    await pool.query('DELETE FROM otp_codes WHERE created_at < ?', [
      at(clock.now() - 24 * 3600 * 1000),
    ]);
  }

  /** Ended or expired sessions are of no use after a day; their token hashes should not pile up. */
  async function purgeOldSessions() {
    await pool.query(
      'DELETE FROM sessions WHERE (is_active = 0 OR expires_at < ?) AND created_at < ?',
      [at(clock.now()), at(clock.now() - 24 * 3600 * 1000)],
    );
  }

  return {
    requestOtp,
    previewCode,
    verifyOtp,
    authenticate,
    logout,
    purgeOldOtps,
    purgeOldSessions,
  };
}
