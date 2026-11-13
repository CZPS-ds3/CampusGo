import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { countPlaceholders, placeholderWarning } from '../src/services/placeholders.js';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const archive = (name) =>
  ctx.pool.query('UPDATE checkpoints SET archived_at = NOW(3) WHERE checkpoint_name = ?', [name]);

describe('BR11 placeholder quiz content is reported until admins replace it', () => {
  it('BR11 the seeded pilot quests all count as placeholder content', async () => {
    const counts = await countPlaceholders(ctx.pool);
    expect(counts.quests).toHaveLength(8);
    expect(counts.quests).toContain('Mensa');
    expect(counts.questions).toBeGreaterThan(0);
    expect(counts.facts).toBe(24); // 3 placeholder facts per pilot quest
  });

  it('BR11 archived quests and switched-off questions no longer count', async () => {
    const before = await countPlaceholders(ctx.pool);
    await archive('Mensa');
    await ctx.pool.query(
      `UPDATE questions q JOIN checkpoints c ON c.checkpoint_id = q.checkpoint_id
       SET q.is_active = 0 WHERE c.checkpoint_name = 'Sensoricum'`,
    );
    const after = await countPlaceholders(ctx.pool);
    expect(after.quests).not.toContain('Mensa');
    expect(after.quests).toContain('Sensoricum'); // its facts are still placeholders
    expect(after.facts).toBe(before.facts - 3);
    expect(after.questions).toBe(before.questions - 13 - 6); // Mensa 10 + 3 hard, Sensoricum 6
  });

  it('BR11 a quest whose texts were all replaced drops out of the list', async () => {
    const [[sensoricum]] = await ctx.pool.query(
      "SELECT checkpoint_id, description FROM checkpoints WHERE checkpoint_name = 'Sensoricum'",
    );
    const id = sensoricum.checkpoint_id;
    const [facts] = await ctx.pool.query(
      'SELECT position, fact_text FROM checkpoint_facts WHERE checkpoint_id = ?',
      [id],
    );
    const [questions] = await ctx.pool.query(
      'SELECT question_id, question_text FROM questions WHERE checkpoint_id = ?',
      [id],
    );
    try {
      await ctx.pool.query('UPDATE checkpoints SET description = ? WHERE checkpoint_id = ?', [
        'The food and sensory research building.',
        id,
      ]);
      await ctx.pool.query(
        "UPDATE checkpoint_facts SET fact_text = CONCAT('Verified fact ', position) WHERE checkpoint_id = ?",
        [id],
      );
      await ctx.pool.query(
        "UPDATE questions SET question_text = CONCAT('Verified question ', question_id) WHERE checkpoint_id = ?",
        [id],
      );
      expect((await countPlaceholders(ctx.pool)).quests).not.toContain('Sensoricum');
    } finally {
      // The seed restores neither texts nor descriptions, so the test puts them back itself.
      await ctx.pool.query('UPDATE checkpoints SET description = ? WHERE checkpoint_id = ?', [
        sensoricum.description,
        id,
      ]);
      for (const f of facts) {
        await ctx.pool.query(
          'UPDATE checkpoint_facts SET fact_text = ? WHERE checkpoint_id = ? AND position = ?',
          [f.fact_text, id, f.position],
        );
      }
      for (const q of questions) {
        await ctx.pool.query('UPDATE questions SET question_text = ? WHERE question_id = ?', [
          q.question_text,
          q.question_id,
        ]);
      }
    }
  });

  it('BR11 the start-up warning names the quests and is silent when none are left', () => {
    expect(placeholderWarning({ questions: 0, facts: 0, quests: [] })).toBeNull();
    const text = placeholderWarning({ questions: 6, facts: 3, quests: ['Sensoricum'] });
    expect(text).toContain('6 placeholder question(s) and 3 placeholder fact(s)');
    expect(text).toContain('Sensoricum');
  });

  it('BR29 the admin dashboard shows the placeholder count fresh, past the 30-second stats cache', async () => {
    const admin = await ctx.login('sekretariat.dski', { firstName: 'Study', lastName: 'Office' });
    const first = (await admin.agent.get('/api/admin/stats').expect(200)).body;
    expect(first.errors).toEqual({});
    expect(first.placeholders.quests).toContain('Mensa');
    await archive('Mensa');
    const second = (await admin.agent.get('/api/admin/stats').expect(200)).body;
    expect(second.placeholders.quests).not.toContain('Mensa');
    expect(second.placeholders.facts).toBe(first.placeholders.facts - 3);
  });
});
