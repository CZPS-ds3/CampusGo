// Settings an administrator changes at run time (BR52, BR55, BR56). Stored in `app_settings`, one row per key.
import { at } from '../clock.js';
import { recordEvent } from './audit.js';

export const OTP_PREVIEW = 'otp_preview';
/** BR56: the invented players of the demo seed appear in rankings and lists (for testing); off by default. */
export const SHOW_DEMO = 'show_demo_players';
export const PILOT_SEEDED = 'pilot_checkpoints_seeded';
/** The team's question bank (backend/src/db/question-bank.js) was put into the pilot quests once. */
export const QUESTION_BANK_SEEDED = 'question_bank_v1';
/**
 * The quest descriptions and "read first" facts of the bank replaced the placeholders, and the quests with a
 * multi-select question of the bank were set to mixed, once (seed.js: seedQuestContent).
 */
export const QUEST_CONTENT_SEEDED = 'quest_content_v1';

/** Reads one setting; `fallback` when the row does not exist yet. */
export async function readSetting(conn, key, fallback = null) {
  const [[row]] = await conn.query('SELECT setting_value FROM app_settings WHERE setting_key = ?', [
    key,
  ]);
  return row ? row.setting_value : fallback;
}

/** Inserts or replaces one setting. */
export async function writeSetting(conn, key, value, { now = Date.now(), actorId = null } = {}) {
  await conn.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at),
       updated_by = VALUES(updated_by)`,
    [key, String(value), at(now), actorId],
  );
}

export function createSettingsService({ pool, config, clock }) {
  /**
   * BR52: while the code preview is on, the login code that is e-mailed is also shown in the test inbox of the
   * login page and printed in the backend terminal. Until an admin decides, development starts with it on and
   * every other environment with it off (OTP_PREVIEW_DEFAULT overrides that start value).
   */
  async function otpPreview() {
    const value = await readSetting(pool, OTP_PREVIEW, null);
    return value === null ? config.otpPreviewDefault : value === 'true';
  }

  async function setOtpPreview(actorId, on) {
    const now = clock.now();
    await writeSetting(pool, OTP_PREVIEW, on ? 'true' : 'false', { now, actorId });
    await recordEvent(pool, now, {
      actorId,
      type: 'setting_changed',
      detail: `OTP code preview ${on ? 'on' : 'off'}`,
    });
    return getAll();
  }

  /** BR56: whether the invented players of the demo seed are shown in rankings, profiles, statistics and lists. */
  async function showDemo() {
    return (await readSetting(pool, SHOW_DEMO, 'false')) === 'true';
  }

  async function setShowDemo(actorId, on) {
    const now = clock.now();
    await writeSetting(pool, SHOW_DEMO, on ? 'true' : 'false', { now, actorId });
    await recordEvent(pool, now, {
      actorId,
      type: 'setting_changed',
      detail: `Demo players ${on ? 'shown' : 'hidden'}`,
    });
    return getAll();
  }

  /** Everything the admin settings page shows. */
  async function getAll() {
    return {
      otpPreview: await otpPreview(),
      showDemo: await showDemo(),
      mailConfigured: Boolean(config.smtp.host),
      environment: config.nodeEnv,
    };
  }

  return { otpPreview, setOtpPreview, showDemo, setShowDemo, getAll };
}
