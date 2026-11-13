// The seed fills the pilot quests with PLACEHOLDER questions, facts and descriptions (see seed.js). They must be
// replaced with verified texts before the pilot, so the API start and the admin dashboard say while any are left.

const MARK = 'PLACEHOLDER%';

/**
 * Counts placeholder content that students could still see: active questions, facts and descriptions of quests
 * that are not archived. `quests` names the quests concerned (at most 20, by name).
 */
export async function countPlaceholders(pool) {
  const [[{ questions }]] = await pool.query(
    `SELECT COUNT(*) AS questions FROM questions q JOIN checkpoints c ON c.checkpoint_id = q.checkpoint_id
     WHERE q.is_active = 1 AND c.archived_at IS NULL AND q.question_text LIKE ?`,
    [MARK],
  );
  const [[{ facts }]] = await pool.query(
    `SELECT COUNT(*) AS facts FROM checkpoint_facts f JOIN checkpoints c ON c.checkpoint_id = f.checkpoint_id
     WHERE c.archived_at IS NULL AND f.fact_text LIKE ?`,
    [MARK],
  );
  const [named] = await pool.query(
    `SELECT c.checkpoint_name FROM checkpoints c WHERE c.archived_at IS NULL AND (
       c.description LIKE ?
       OR EXISTS (SELECT 1 FROM questions q WHERE q.checkpoint_id = c.checkpoint_id AND q.is_active = 1
                  AND q.question_text LIKE ?)
       OR EXISTS (SELECT 1 FROM checkpoint_facts f WHERE f.checkpoint_id = c.checkpoint_id AND f.fact_text LIKE ?))
     ORDER BY c.checkpoint_id LIMIT 20`,
    [MARK, MARK, MARK],
  );
  return {
    questions: Number(questions),
    facts: Number(facts),
    quests: named.map((r) => r.checkpoint_name),
  };
}

/** One log line for the API start, or null when no placeholder content is left. */
export function placeholderWarning({ questions, facts, quests }) {
  if (quests.length === 0) return null;
  return (
    `${questions} placeholder question(s) and ${facts} placeholder fact(s) are still live in ` +
    `${quests.length} quest(s) (${quests.join(', ')}). Replace them on the admin Quests page before the pilot.`
  );
}
