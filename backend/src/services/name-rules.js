// Name rules: built-in word list plus the terms administrators added (table banned_terms).
import { assertNameAllowed, findBannedTerm } from './name-filter.js';

export function createNameRules({ pool }) {
  let cache = null;

  async function extra() {
    if (!cache) {
      const [rows] = await pool.query('SELECT term, mode FROM banned_terms');
      cache = {
        substring: rows.filter((r) => r.mode === 'substring').map((r) => r.term),
        token: rows.filter((r) => r.mode === 'token').map((r) => r.term),
      };
    }
    return cache;
  }

  /** Throws NAME_NOT_ALLOWED when any of the values contains a banned word. */
  async function assertAllowed(...values) {
    const terms = await extra();
    for (const value of values) assertNameAllowed(value, terms);
  }

  async function check(text) {
    return findBannedTerm(text, await extra());
  }

  /** Call after the term list changed. */
  const reset = () => {
    cache = null;
  };

  return { assertAllowed, check, reset };
}
