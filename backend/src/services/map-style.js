// One map style per student account (BR48): base (light, dark or follow the app theme), a colour tint over the
// map, the colours of the checkpoint pins, the highlight, the walking route and the buildings of the 3D map. Colours are validated and stored
// as #RRGGBB, so the page can use them in CSS without any further checking.
import { AppError } from '../middleware/errors.js';

export const MAP_BASES = ['follow', 'light', 'dark'];

/** The default style: follows the app theme (light unless the student chose dark) and keeps the DHBW colours. */
export const DEFAULT_MAP_STYLE = {
  preset: 'classic',
  base: 'follow',
  tint: { color: '#ffffff', strength: 0 },
  pins: { open: '#4d5861', done: '#137a4e', locked: '#8a949c' },
  highlight: '#e2001a',
  route: '#e2001a',
  buildings: '#dcd9d4',
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;
const byte = (n) => n.toString(16).padStart(2, '0');

/** "#abc", "#aabbcc" or "rgb(1, 2, 3)" as "#aabbcc"; null when it is none of them (or a channel is above 255). */
export function normalizeColor(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (HEX.test(text)) {
    const digits = text.slice(1).toLowerCase();
    return `#${digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits}`;
  }
  const match = RGB.exec(text);
  if (!match) return null;
  const channels = match.slice(1).map(Number);
  return channels.every((c) => c <= 255) ? `#${channels.map(byte).join('')}` : null;
}

function exactKeys(object, keys, path, problems) {
  if (typeof object !== 'object' || object === null || Array.isArray(object)) {
    problems.push(`${path} must be an object`);
    return false;
  }
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) problems.push(`${path}.${key} is not a known setting`);
  }
  return true;
}

/** Returns the clean style or throws a 400 that names every problem. Missing settings take the default. */
export function validateMapStyle(input) {
  const problems = [];
  const style = structuredClone(DEFAULT_MAP_STYLE);
  if (!exactKeys(input, Object.keys(DEFAULT_MAP_STYLE), 'style', problems)) {
    throw new AppError(400, 'INVALID_MAP_STYLE', problems.join('; '));
  }
  const colour = (value, path) => {
    const clean = normalizeColor(value);
    if (!clean) problems.push(`${path} is not a colour: use #RRGGBB or rgb(0-255, 0-255, 0-255)`);
    return clean;
  };
  if (input.preset !== undefined) {
    if (typeof input.preset === 'string' && /^[a-z0-9-]{1,20}$/.test(input.preset)) {
      style.preset = input.preset;
    } else problems.push('preset must be 1-20 letters, digits or dashes');
  }
  if (input.base !== undefined) {
    if (MAP_BASES.includes(input.base)) style.base = input.base;
    else problems.push(`base must be one of ${MAP_BASES.join(', ')}`);
  }
  if (input.tint !== undefined && exactKeys(input.tint, ['color', 'strength'], 'tint', problems)) {
    if (input.tint.color !== undefined) style.tint.color = colour(input.tint.color, 'tint.color');
    if (input.tint.strength !== undefined) {
      const { strength } = input.tint;
      if (Number.isInteger(strength) && strength >= 0 && strength <= 100)
        style.tint.strength = strength;
      else problems.push('tint.strength must be a whole number from 0 to 100');
    }
  }
  if (
    input.pins !== undefined &&
    exactKeys(input.pins, ['open', 'done', 'locked'], 'pins', problems)
  ) {
    for (const key of Object.keys(input.pins))
      style.pins[key] = colour(input.pins[key], `pins.${key}`);
  }
  for (const key of ['highlight', 'route', 'buildings']) {
    if (input[key] !== undefined) style[key] = colour(input[key], key);
  }
  if (problems.length > 0) throw new AppError(400, 'INVALID_MAP_STYLE', problems.join('; '));
  return style;
}

export function createMapStyleService({ pool }) {
  async function get(studentId) {
    const [[row]] = await pool.query('SELECT map_style FROM students WHERE student_id = ?', [
      studentId,
    ]);
    const saved = typeof row?.map_style === 'string' ? JSON.parse(row.map_style) : row?.map_style;
    return saved ? validateMapStyle(saved) : structuredClone(DEFAULT_MAP_STYLE);
  }

  /** Replaces the student's one and only style. */
  async function save(studentId, input) {
    const style = validateMapStyle(input);
    await pool.query('UPDATE students SET map_style = ? WHERE student_id = ?', [
      JSON.stringify(style),
      studentId,
    ]);
    return style;
  }

  async function reset(studentId) {
    await pool.query('UPDATE students SET map_style = NULL WHERE student_id = ?', [studentId]);
    return structuredClone(DEFAULT_MAP_STYLE);
  }

  return { get, save, reset };
}
