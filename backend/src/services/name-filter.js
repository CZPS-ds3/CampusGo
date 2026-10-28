// Name filter for nicknames, names and team names (German and English).
// Words are compared token by token, so a banned word inside a harmless name ("Cass", "Classic",
// "Scunthorpe") does not trigger it, while spelling tricks (f.u.c.k, 5h1t, fuuuck) still do.
import { SUBSTRING_TERMS, TOKEN_TERMS } from './name-filter-terms.js';
import { AppError } from '../middleware/errors.js';

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };

/** Lower-case, without accents, "ß" as "ss", look-alike digits and symbols turned into letters. */
function fold(text) {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[0134578@$!]/g, (c) => LEET[c] ?? c);
}

const collapse = (text, max) =>
  text.replace(/(.)\1+/gu, (run, c) => c.repeat(Math.min(run.length, max)));

/** Splits at separators and at lower-to-upper changes ("BigAss"), keeps look-alike symbols inside words. */
function tokens(text) {
  const words = text
    .replace(/([a-zäöüß])([A-ZÄÖÜ])/gu, '$1 $2')
    .split(/[^\p{L}\p{N}@$!]+/u)
    .filter(Boolean);
  // "f.u.c.k" arrives as single letters; join each run of them so it is judged as one word.
  const joined = [];
  let singles = '';
  for (const word of words) {
    if ([...word].length === 1) {
      singles += word;
      continue;
    }
    if (singles) joined.push(singles);
    singles = '';
    joined.push(word);
  }
  if (singles) joined.push(singles);
  return joined.map(fold);
}

const squash = (text) => collapse(text, 1);

/**
 * Returns the banned term found in `text`, or null. `extra` adds terms from the database
 * ({ substring: [], token: [] }) that administrators maintain.
 */
export function findBannedTerm(text, extra = {}) {
  const substringTerms = [...SUBSTRING_TERMS, ...(extra.substring ?? [])].map((t) => fold(t));
  const tokenTerms = new Set([...TOKEN_TERMS, ...(extra.token ?? [])].map((t) => fold(t)));
  for (const word of tokens(String(text ?? ''))) {
    const forms = [word, collapse(word, 2)];
    for (const form of forms) {
      if (tokenTerms.has(form)) return form;
    }
    for (const term of substringTerms) {
      if (word.includes(term) || squash(word).includes(squash(term))) return term;
    }
  }
  return null;
}

/** Throws a validation error (HTTP 400) when a name is not allowed. */
export function assertNameAllowed(value, extra) {
  if (value && findBannedTerm(value, extra)) {
    throw new AppError(400, 'NAME_NOT_ALLOWED', 'Please choose a different name.');
  }
}
