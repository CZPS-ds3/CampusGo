import { useCallback, useState } from 'react';

// A phone often needs a few seconds to settle on a good fix, and a laptop or a phone indoors may only manage a coarse
// one. So the position is watched for a short while and the most precise reading wins; if the GPS finds nothing,
// the network position (Wi-Fi, mobile) is tried before giving up.
const GOOD_ENOUGH_M = 30;
const GPS_WINDOW_MS = 8000;
const NETWORK_WINDOW_MS = 6000;

/** Maps the browser's error codes to the names the UI works with. */
function failureFrom(error) {
  if (error?.code === 1) return 'denied';
  if (error?.code === 3) return 'timeout';
  return 'unavailable';
}

/**
 * One position sample from the Geolocation API. Rejects with 'denied' | 'timeout' | 'unavailable'.
 * `ageMs` is phone clock minus phone clock, so a phone whose clock is off is not blocked by the server.
 */
export async function getPosition(fake) {
  if (fake) return { ageMs: 0, ...fake };
  if (!('geolocation' in navigator)) throw 'unavailable';
  try {
    return await watchBest(true, GPS_WINDOW_MS);
  } catch (reason) {
    if (reason === 'denied') throw reason;
    return watchBest(false, NETWORK_WINDOW_MS);
  }
}

/**
 * Watches the position for up to `windowMs` and resolves with the most precise reading (at once when one is good
 * enough). Rejects with 'denied' | 'timeout' | 'unavailable' when there was no reading at all.
 */
function watchBest(enableHighAccuracy, windowMs) {
  return new Promise((resolve, reject) => {
    let best = null;
    let failure = 'timeout';
    let finished = false;
    let watchId = null;
    let timer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (!best) return reject(failure);
      // The age is worked out now, so a reading kept for a few seconds is not sent as if it were brand new.
      return resolve({
        latitude: best.latitude,
        longitude: best.longitude,
        accuracy: best.accuracy,
        ageMs: Math.max(0, Date.now() - best.takenAt),
      });
    };
    timer = setTimeout(finish, windowMs);
    watchId = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => {
        if (!best || coords.accuracy < best.accuracy) {
          best = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            takenAt: timestamp,
          };
        }
        if (coords.accuracy <= GOOD_ENOUGH_M) finish();
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
 * never stored in state, logged or kept anywhere else (privacy rule: the server stores only yes/no).
 */
export function useGeolocation() {
  const [busy, setBusy] = useState(false);
  const locate = useCallback(async (fake) => {
    setBusy(true);
    try {
      return { sample: await getPosition(fake) };
    } catch (reason) {
      return { failure: typeof reason === 'string' ? reason : 'unavailable' };
    } finally {
      setBusy(false);
    }
  }, []);
  return { locate, busy };
}
