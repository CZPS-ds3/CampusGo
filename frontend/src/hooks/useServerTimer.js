import { useEffect, useState } from 'react';

/**
 * Counts down to a deadline given by the server. The client only draws: it corrects for clock skew with
 * `serverNow`, and the server alone decides when an attempt is over. Redraws every 250 ms and again when
 * the tab becomes visible (timers are throttled in hidden tabs).
 */
export function useServerTimer(expiresAt, serverNow) {
  const deadline = expiresAt ? Date.parse(expiresAt) : null;
  const [tick, setTick] = useState({ deadline: null, remainingMs: 0 });

  useEffect(() => {
    if (deadline === null) return undefined;
    const offset = Date.parse(serverNow) - Date.now();
    const update = () =>
      setTick({ deadline, remainingMs: Math.max(0, deadline - (Date.now() + offset)) });
    update();
    const id = setInterval(update, 250);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', update);
    };
  }, [deadline, serverNow]);

  // Until the first tick for this deadline, use the server's own difference so a fresh attempt never
  // looks expired for a frame.
  const remainingMs =
    deadline === null
      ? 0
      : tick.deadline === deadline
        ? tick.remainingMs
        : Math.max(0, deadline - Date.parse(serverNow));
  return { remainingMs, seconds: Math.ceil(remainingMs / 1000) };
}

/** m:ss text for whole seconds. */
export const formatClock = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
