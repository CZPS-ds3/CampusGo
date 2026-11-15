import { useCallback, useState } from 'react';
import { distanceM } from '../geo.js';

// A phone needs a few seconds to settle on a good fix, and every single fix jitters by a few metres. So the
// position is watched for a short while: precise readings are collected and averaged (each weighted by its
// accuracy), readings the browser kept from earlier and readings far off the others are left out. If the GPS finds
// nothing, the network position (Wi-Fi, mobile) is tried before giving up.
const EXCELLENT_M = 5; // one reading this precise ends the wait at once
const GOOD_M = 20; // readings this precise are worth collecting a few of
const SETTLE_MS = 2500; // how long to keep collecting after the first good reading
const ENOUGH_GOOD = 5; // ... unless this many good readings have arrived already
const GPS_WINDOW_MS = 8000;
const NETWORK_WINDOW_MS = 6000;
// A reading taken this long before the watch began was kept by the browser from earlier: used only when it is all
// there is.
const CACHED_MS = 2000;

/** Maps the browser's error codes to the names the UI works with. */
function failureFrom(error) {
  if (error?.code === 1) return 'denied';
  if (error?.code === 3) return 'timeout';
  return 'unavailable';
}

/**
 * One position from the readings of a watch: the accuracy-weighted average of the precise readings that agree
 * with the most precise one. `accuracy` stays that of the most precise reading (the average is usually better, but
 * GPS errors are partly shared between readings, so a smaller figure would claim more than is known) and `ageMs`
 * is that of the oldest reading used. Returns null without readings.
 */
export function combineReadings(readings, startedAt, now = Date.now()) {
  if (!readings.length) return null;
  const fresh = readings.filter((r) => r.takenAt >= startedAt - CACHED_MS);
  const pool = fresh.length ? fresh : readings;
  const best = pool.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));
  const usable = pool.filter(
    (r) =>
      r.accuracy <= Math.max(GOOD_M, best.accuracy * 1.5) &&
      distanceM([r.latitude, r.longitude], [best.latitude, best.longitude]) <=
        r.accuracy + best.accuracy,
  );
  // A reading of accuracy 0 (a faked or simulated position) is exact: it decides alone.
  const exact = usable.find((r) => r.accuracy === 0);
  const used = exact ? [exact] : usable;
  const weight = (r) => 1 / Math.max(r.accuracy, 0.5) ** 2;
  const total = used.reduce((sum, r) => sum + weight(r), 0);
  const mean = (key) => used.reduce((sum, r) => sum + r[key] * weight(r), 0) / total;
  return {
    latitude: mean('latitude'),
    longitude: mean('longitude'),
    accuracy: best.accuracy,
    // The age is worked out now, so readings kept for a few seconds are not sent as if they were brand new.
    ageMs: Math.max(0, now - Math.min(...used.map((r) => r.takenAt))),
  };
}

/**
 * One position sample from the Geolocation API. Rejects with 'denied' | 'timeout' | 'unavailable'.
 * `ageMs` is phone clock minus phone clock, so a phone whose clock is off is not blocked by the server.
 * `onProgress(accuracy)` hears the best accuracy so far (metres), for the "hold still" screen.
 */
export async function getPosition(fake, onProgress) {
  if (fake) return { ageMs: 0, ...fake };
  if (!('geolocation' in navigator)) throw 'unavailable';
  try {
    return await watchBest(true, GPS_WINDOW_MS, onProgress);
  } catch (reason) {
    if (reason === 'denied') throw reason;
    return watchBest(false, NETWORK_WINDOW_MS, onProgress);
  }
}

/**
 * Watches the position for up to `windowMs` and resolves with the combined readings: at once for an excellent
 * reading, else a short while after the first good one. Rejects with 'denied' | 'timeout' | 'unavailable' when there
 * was no reading at all.
 */
function watchBest(enableHighAccuracy, windowMs, onProgress) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const readings = [];
    let failure = 'timeout';
    let finished = false;
    let watchId = null;
    let settle = null;
    let best = Infinity;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(settle);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      const position = combineReadings(readings, startedAt);
      return position ? resolve(position) : reject(failure);
    };
    const timer = setTimeout(finish, windowMs);
    watchId = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => {
        if (finished || !Number.isFinite(coords.accuracy)) return;
        readings.push({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          takenAt: timestamp ?? Date.now(),
        });
        if (coords.accuracy < best) {
          best = coords.accuracy;
          onProgress?.(Math.round(best));
        }
        const good = readings.filter((r) => r.accuracy <= GOOD_M).length;
        if (coords.accuracy <= EXCELLENT_M || good >= ENOUGH_GOOD) finish();
        else if (good === 1 && settle === null) settle = setTimeout(finish, SETTLE_MS);
      },
      (error) => {
        failure = failureFrom(error);
        if (failure === 'denied') finish();
      },
      { enableHighAccuracy, timeout: windowMs, maximumAge: 0 },
    );
    // A watch that answered synchronously (some test doubles) may already be done.
    if (finished) navigator.geolocation.clearWatch(watchId);
  });
}

/**
 * Asks the browser for the position when `locate` is called. Coordinates are handed to the caller and are
 * never stored in state, logged or kept anywhere else (privacy rule: the server stores only yes/no); only the
 * accuracy so far (metres) is, for the progress text.
 */
export function useGeolocation() {
  const [busy, setBusy] = useState(false);
  const [accuracy, setAccuracy] = useState(null);
  const locate = useCallback(async (fake) => {
    setBusy(true);
    setAccuracy(null);
    try {
      return { sample: await getPosition(fake, setAccuracy) };
    } catch (reason) {
      return { failure: typeof reason === 'string' ? reason : 'unavailable' };
    } finally {
      setBusy(false);
    }
  }, []);
  return { locate, busy, accuracy };
}
