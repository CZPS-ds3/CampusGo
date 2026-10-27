import { useSyncExternalStore } from "react";
import { DE } from "./de";

export type Lang = "en" | "de";
export type Theme = "light" | "dark";
export type FontSize = "s" | "m" | "l" | "xl";
export const FONT_SCALE: Record<FontSize, number> = { s: 0.9, m: 1, l: 1.15, xl: 1.3 };

type State = { lang: Lang; theme: Theme; size: FontSize };
const KEY = "ccq-settings-v1";

const load = (): State => {
  const base: State = { lang: typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("de") ? "de" : "en", theme: "light", size: "m" };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return base;
  }
};

let state: State = load();
const subs = new Set<() => void>();

function apply() {
  const r = document.documentElement;
  r.dataset.theme = state.theme;
  r.lang = state.lang;
  r.style.setProperty("--fs", String(FONT_SCALE[state.size]));
}
apply();

export function setSettings(patch: Partial<State>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
  apply();
  subs.forEach((f) => f());
}

/** Subscribe a component (the App root) so the whole tree re-renders on any settings change. */
export function useSettings() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );
}

/** Translate an English source string. Unknown strings fall back to English. `{name}` placeholders are filled from vars. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = state.lang === "de" ? (DE.get(key) ?? key) : key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

export const getLang = () => state.lang;
