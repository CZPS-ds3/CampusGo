import { useEffect, useRef } from 'react';

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

/** Timestamp of the last tap, click or key press anywhere on the page (shared by every caller). */
let lastInput = Date.now();
let listening = false;

function listenForInput() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const note = () => {
    lastInput = Date.now();
  };
  for (const name of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(name, note, { passive: true });
  }
}

/** True while the page is in front and the person did something in the last few minutes. */
export function personIsHere(now = Date.now()) {
  return document.visibilityState === 'visible' && now - lastInput < ACTIVE_WINDOW_MS;
}

/**
 * Runs `refresh` every `everyMs` and again when the person comes back to the tab, so what is on screen follows
 * changes made elsewhere (another admin, another device) without a manual reload. It pauses while nobody is
 * looking, because every request also counts as activity for the session's inactivity timeout (BR03).
 */
export function useAutoRefresh(refresh, everyMs = 15_000, enabled = true) {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    listenForInput();
    const run = () => {
      if (personIsHere()) latest.current();
    };
    const timer = setInterval(run, everyMs);
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', run);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', run);
    };
  }, [everyMs, enabled]);
}
