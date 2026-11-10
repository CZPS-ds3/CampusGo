import { useSyncExternalStore } from 'react';
import { DE } from './de.js';
import { DE_EXTRA } from './de-extra.js';

// Language, theme and font size live in one small store; the root component subscribes so the whole tree
// re-renders when one of them changes. Texts are written in English and translated by key (t()).
export const FONT_SCALE = { s: 0.9, m: 1, l: 1.15, xl: 1.3 };
const KEY = 'ccq-settings-v1';

const browserLang = () =>
  typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de')
    ? 'de'
    : 'en';

export const MAP_BASES = ['aerial', 'street'];
const DEFAULT_MAP_BASE = import.meta.env.VITE_MAP_BASE === 'street' ? 'street' : 'aerial';
// The flat map stays the default: the 3D map needs WebGL and is heavier on older phones.
export const MAP_VIEWS = ['2d', '3d'];
const DEFAULT_MAP_VIEW = import.meta.env.VITE_MAP_VIEW === '3d' ? '3d' : '2d';

function load() {
  const base = {
    lang: browserLang(),
    theme: 'light',
    size: 'm',
    mapBase: DEFAULT_MAP_BASE,
    mapView: DEFAULT_MAP_VIEW,
  };
  try {
    const stored = { ...base, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    if (!MAP_BASES.includes(stored.mapBase)) stored.mapBase = DEFAULT_MAP_BASE;
    if (!MAP_VIEWS.includes(stored.mapView)) stored.mapView = DEFAULT_MAP_VIEW;
    return stored;
  } catch {
    return base;
  }
}

let state = load();
const subscribers = new Set();

function apply() {
  const root = document.documentElement;
  root.dataset.theme = state.theme;
  root.lang = state.lang;
  root.style.setProperty('--fs', String(FONT_SCALE[state.size] ?? 1));
}
apply();

export function setSettings(patch) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage can be blocked (private window); the setting then lasts until the page is closed.
  }
  apply();
  subscribers.forEach((notify) => notify());
}

export function useSettings() {
  return useSyncExternalStore(
    (notify) => {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
    () => state,
  );
}

/** Translates an English source text. Unknown texts stay English. `{name}` placeholders are filled from vars. */
export function t(key, vars) {
  let text = state.lang === 'de' ? (DE_EXTRA.get(key) ?? DE.get(key) ?? key) : key;
  if (vars) for (const name in vars) text = text.split(`{${name}}`).join(String(vars[name]));
  return text;
}

export const getLang = () => state.lang;
/** The map type a map starts with on this device: 'aerial' or 'street'. */
export const getMapBase = () => state.mapBase;
/** The view a map starts with on this device: '2d' (Leaflet) or '3d' (MapLibre, tilted with buildings). */
export const getMapView = () => state.mapView;
export const formatNumber = (n) => n.toLocaleString(state.lang === 'de' ? 'de-DE' : 'en-US');
