// Injectable clock: the server decides all time questions (BR22). Tests replace it to move time.
export const systemClock = { now: () => Date.now() };

export function createFakeClock(startMs = Date.UTC(2026, 10, 2, 12, 0, 0)) {
  let current = startMs;
  return {
    now: () => current,
    set: (ms) => {
      current = ms;
    },
    advance: (ms) => {
      current += ms;
    },
  };
}

/** Date object for a clock reading. mysql2 writes Date objects as UTC (timezone: 'Z'). */
export const at = (ms) => new Date(ms);
