import { useSyncExternalStore } from 'react';
import { normalizeColor, readableOn } from './colors.js';

// One map style per account (the server is the truth, BR48). It is cached in the browser so the map has its colours
// at once, and applied to the page as CSS variables that the map styles use.
const KEY = 'ccq-map-style-v1';

/** How often a sonar wave goes out from the ball and what it looks like (BR48). */
export const SONAR_SPEEDS = ['slow', 'normal', 'fast'];
export const SONAR_LOOKS = ['sova', 'soft'];

export const DEFAULT_MAP_STYLE = {
  preset: 'classic',
  base: 'follow',
  tint: { color: '#ffffff', strength: 0 },
  pins: { open: '#4d5861', done: '#137a4e', locked: '#8a949c' },
  highlight: '#e2001a',
  route: '#e2001a',
  buildings: '#dcd9d4',
  ball: { body: '#ffffff', lines: '#e2001a' },
  sonar: { show: true, color: '#e2001a', speed: 'normal', look: 'sova', ping: true },
};

export const PRESETS = {
  classic: DEFAULT_MAP_STYLE,
  ocean: {
    preset: 'ocean',
    base: 'follow',
    tint: { color: '#9ad0f5', strength: 30 },
    pins: { open: '#0b5cad', done: '#0a7d5a', locked: '#7a8aa0' },
    highlight: '#ff7a00',
    route: '#0b5cad',
    buildings: '#c5dcef',
    ball: { body: '#ffffff', lines: '#0b5cad' },
    sonar: { show: true, color: '#0b5cad', speed: 'normal', look: 'sova', ping: true },
  },
  forest: {
    preset: 'forest',
    base: 'follow',
    tint: { color: '#b9e2b0', strength: 30 },
    pins: { open: '#2f5d34', done: '#8a5a00', locked: '#7d8c7a' },
    highlight: '#c2185b',
    route: '#2f5d34',
    buildings: '#cfe0c4',
    ball: { body: '#f4f9ef', lines: '#2f5d34' },
    sonar: { show: true, color: '#2f5d34', speed: 'normal', look: 'sova', ping: true },
  },
  sunset: {
    preset: 'sunset',
    base: 'follow',
    tint: { color: '#ffd2a8', strength: 35 },
    pins: { open: '#8a3b12', done: '#2d6a4f', locked: '#a08c80' },
    highlight: '#d6246e',
    route: '#d6246e',
    buildings: '#f0d2bd',
    ball: { body: '#fff3e6', lines: '#d6246e' },
    sonar: { show: true, color: '#d6246e', speed: 'normal', look: 'sova', ping: true },
  },
  mono: {
    preset: 'mono',
    base: 'follow',
    tint: { color: '#ffffff', strength: 0 },
    pins: { open: '#333333', done: '#666666', locked: '#999999' },
    highlight: '#000000',
    route: '#000000',
    buildings: '#cccccc',
    ball: { body: '#ffffff', lines: '#000000' },
    sonar: { show: true, color: '#000000', speed: 'normal', look: 'sova', ping: true },
  },
};

/** A complete, clean style from anything stored: unknown or broken settings fall back to the default. */
export function cleanStyle(input) {
  const base = structuredClone(DEFAULT_MAP_STYLE);
  if (!input || typeof input !== 'object') return base;
  const colour = (value, fallback) => normalizeColor(value) ?? fallback;
  if (['follow', 'light', 'dark'].includes(input.base)) base.base = input.base;
  if (typeof input.preset === 'string' && /^[a-z0-9-]{1,20}$/.test(input.preset)) {
    base.preset = input.preset;
  }
  base.tint.color = colour(input.tint?.color, base.tint.color);
  const strength = input.tint?.strength;
  if (Number.isInteger(strength) && strength >= 0 && strength <= 100) base.tint.strength = strength;
  for (const key of ['open', 'done', 'locked']) {
    base.pins[key] = colour(input.pins?.[key], base.pins[key]);
  }
  base.highlight = colour(input.highlight, base.highlight);
  base.route = colour(input.route, base.route);
  base.buildings = colour(input.buildings, base.buildings);
  for (const key of ['body', 'lines']) {
    base.ball[key] = colour(input.ball?.[key], base.ball[key]);
  }
  const sonar = input.sonar ?? {};
  base.sonar.color = colour(sonar.color, base.sonar.color);
  if (typeof sonar.show === 'boolean') base.sonar.show = sonar.show;
  if (typeof sonar.ping === 'boolean') base.sonar.ping = sonar.ping;
  if (SONAR_SPEEDS.includes(sonar.speed)) base.sonar.speed = sonar.speed;
  if (SONAR_LOOKS.includes(sonar.look)) base.sonar.look = sonar.look;
  return base;
}

function readCache() {
  try {
    return cleanStyle(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    return structuredClone(DEFAULT_MAP_STYLE);
  }
}

let style = readCache();
const subscribers = new Set();

/** The direction wedge under the ball in the colour of its lines (undefined keeps the red of screens.css). */
const beam = (color) =>
  color === undefined
    ? undefined
    : `radial-gradient(closest-side, ${color}80, ${color}4d 65%, transparent 100%)`;

/**
 * CSS variables for a style. A colour that is still the default is left out, so the colours of the light and dark
 * theme apply; `keepDefaults` (the live preview) writes every colour.
 */
export function styleVariables(value, { keepDefaults = false } = {}) {
  const custom = (color, fallback) => (keepDefaults || color !== fallback ? color : undefined);
  const pin = (name, color, fallback) => {
    const used = custom(color, fallback);
    return {
      [`--${name}`]: used,
      [`--${name}-fg`]: used === undefined ? undefined : readableOn(used),
    };
  };
  const d = DEFAULT_MAP_STYLE;
  return {
    '--map-tint-ground': value.tint.strength > 0 ? value.tint.color : undefined,
    '--map-tint-opacity':
      value.tint.strength > 0 ? String(1 - value.tint.strength / 100) : undefined,
    ...pin('pin-open', value.pins.open, d.pins.open),
    ...pin('pin-done', value.pins.done, d.pins.done),
    ...pin('pin-locked', value.pins.locked, d.pins.locked),
    ...pin('highlight', value.highlight, d.highlight),
    '--route': custom(value.route, d.route),
    '--buildings': custom(value.buildings, d.buildings),
    '--puck-body': custom(value.ball.body, d.ball.body),
    '--puck-lines': custom(value.ball.lines, d.ball.lines),
    '--puck-beam': beam(custom(value.ball.lines, d.ball.lines)),
    '--sonar': custom(value.sonar.color, d.sonar.color),
  };
}

/**
 * The sonar settings as data attributes (data-sonar, data-sonar-look, data-sonar-speed, data-sonar-ping): screens.css
 * picks the look and speed from them, and the maps read whether to flash the quests in range.
 */
export const sonarData = ({ sonar }) => ({
  sonar: sonar.show ? 'on' : 'off',
  sonarLook: sonar.look,
  sonarSpeed: sonar.speed,
  sonarPing: sonar.show && sonar.ping ? 'on' : 'off',
});

function apply() {
  const root = document.documentElement;
  root.dataset.mapBase = style.base;
  Object.assign(root.dataset, sonarData(style));
  for (const [name, value] of Object.entries(styleVariables(style))) {
    if (value === undefined) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }
}
apply();

function publish(next) {
  style = cleanStyle(next);
  apply();
  try {
    localStorage.setItem(KEY, JSON.stringify(style));
  } catch {
    // Storage can be blocked; the style then lasts until the page is closed.
  }
  for (const notify of subscribers) notify();
}

export function useMapStyle() {
  return useSyncExternalStore(
    (notify) => {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
    () => style,
  );
}

/** Shows a style at once (before it is saved). */
export const showMapStyle = (next) => publish(next);

/** After sign-in: the account's style replaces whatever this browser had. */
export async function loadMapStyle(api) {
  try {
    publish((await api.mapStyle()).style);
  } catch {
    // The cached style stays; the map must work without it.
  }
}

/** Saves the one style of the account. Returns what the server stored. */
export async function saveMapStyle(api, next) {
  const saved = (await api.saveMapStyle(next)).style;
  publish(saved);
  return saved;
}

export async function resetMapStyle(api) {
  const saved = (await api.resetMapStyle()).style;
  publish(saved);
  return saved;
}

/** Signing out: this browser goes back to the default look, so the next person does not inherit it. */
export const forgetMapStyle = () => publish(DEFAULT_MAP_STYLE);
