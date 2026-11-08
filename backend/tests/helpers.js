import request from 'supertest';
import { createApp } from '../src/app.js';
import { createFakeClock } from '../src/clock.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { seedPlaceholderFacts, seedPlaceholderQuestions, seedReference } from '../src/db/seed.js';
import { createTestMailer } from '../src/services/mailer.js';

const TABLES = [
  'location_checks',
  'attempt_answers',
  'attempt_questions',
  'attempts',
  'team_invitations',
  'sessions',
  'otp_codes',
  'students',
  'teams',
  'audit_events',
  'banned_terms',
];

export const DOMAIN = 'heilbronn.dhbw.de';

/** Builds the app against the test database with a fake clock and an in-memory mailer. */
export async function createTestContext(envOverrides = {}) {
  const config = { ...loadConfig({ ...process.env, NODE_ENV: 'test', ...envOverrides }) };
  const pool = createPool(config.databaseUrl);
  const clock = createFakeClock();
  const mailer = createTestMailer();
  const { app, services } = createApp({ pool, config, mailer, clock });

  async function reset() {
    const conn = await pool.getConnection();
    try {
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const table of TABLES) await conn.query(`DELETE FROM ${table}`);
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      // Quests made by quest tests (their titles start with "TQ ") are removed, the seeded ones are put back as seeded.
      await conn.query(
        `DELETE o FROM options o JOIN questions q ON q.question_id = o.question_id
         JOIN checkpoints c ON c.checkpoint_id = q.checkpoint_id WHERE c.checkpoint_name LIKE 'TQ %'`,
      );
      await conn.query(
        "DELETE q FROM questions q JOIN checkpoints c ON c.checkpoint_id = q.checkpoint_id WHERE c.checkpoint_name LIKE 'TQ %'",
      );
      await conn.query("DELETE FROM checkpoints WHERE checkpoint_name LIKE 'TQ %'");
      await conn.query(
        "UPDATE checkpoints SET time_limit_seconds = NULL, type_mode = 'MCQ_ONLY', archived_at = NULL",
      );
      await seedReference(conn);
      await seedPlaceholderFacts(conn);
      await seedPlaceholderQuestions(conn); // inserts once, later runs only reset the flags below
      await conn.query('UPDATE checkpoints SET is_active = 1');
      await conn.query('UPDATE questions SET is_active = 1');
    } finally {
      conn.release();
    }
    mailer.outbox.length = 0;
    clock.set(Date.UTC(2026, 10, 2, 12, 0, 0));
  }

  /** Signs a new or existing student in through the real endpoints. Returns a cookie-keeping agent. */
  async function login(local, { firstName = 'Test', lastName = 'Student', nickname } = {}) {
    const email = `${local}@${DOMAIN}`;
    const agent = request.agent(app);
    await agent.post('/api/auth/request-otp').send({ email }).expect(200);
    await mailer.idle();
    const otp = mailer.lastTo(email).text.match(/\b(\d{6})\b/)[1];
    const res = await agent
      .post('/api/auth/verify')
      .send({ email, otp, firstName, lastName, nickname });
    if (![200, 201].includes(res.status))
      throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
    clock.advance(31_000); // stay clear of the resend cooldown for the next login
    const token = (res.headers['set-cookie'] ?? []).join(';').match(/cq_session=([0-9a-f]+)/)?.[1];
    return { agent, email, student: res.body.student, token };
  }

  async function checkpointByName(agent, name) {
    const { body } = await agent.get('/api/checkpoints').expect(200);
    return body.checkpoints.find((c) => c.name === name);
  }

  /** One reading sent to the verify endpoint; `offset` moves it north in degrees (invented positions only). */
  function verify(agent, checkpoint, { accuracy = 10, offset = 0, ageMs = 0 } = {}) {
    return agent
      .post(`/api/checkpoints/${checkpoint.id}/verify`)
      .send({ lat: checkpoint.latitude + offset, lng: checkpoint.longitude, accuracy, ageMs });
  }

  /** Consent, then a fresh reading at the checkpoint centre, which unlocks the quiz. Returns the attempt view. */
  async function startAttempt(agent, checkpointName) {
    await agent.post('/api/me/location-consent').expect(204);
    const checkpoint = await checkpointByName(agent, checkpointName);
    const res = await verify(agent, checkpoint);
    if (res.status !== 200 || res.body.status !== 'OK')
      throw new Error(`unlock failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.attempt;
  }

  /** Looks up the correct (or a wrong) option for the question currently shown. */
  async function optionFor(attempt, correct) {
    const question = attempt.questions.find((q) => q.number === attempt.currentQuestion);
    const [rows] = await pool.query(
      'SELECT option_id FROM options WHERE question_id = ? AND is_correct = ? ORDER BY option_position LIMIT 1',
      [question.id, correct ? 1 : 0],
    );
    return rows[0].option_id;
  }

  async function answer(agent, attempt, correct) {
    const optionId = await optionFor(attempt, correct);
    return agent.post(`/api/attempts/${attempt.id}/answers`).send({ optionId });
  }

  /** Answers every remaining question following `pattern` (array of booleans). Returns the last response. */
  async function answerPattern(agent, attempt, pattern) {
    let current = attempt;
    let res;
    for (const correct of pattern) {
      res = await answer(agent, current, correct);
      if (res.status !== 200) return res;
      current = res.body.attempt;
    }
    return res;
  }

  async function close() {
    await pool.end();
  }

  return {
    app,
    config,
    pool,
    clock,
    mailer,
    services,
    reset,
    login,
    checkpointByName,
    verify,
    startAttempt,
    answer,
    answerPattern,
    optionFor,
    close,
  };
}
