import { useCallback, useState } from 'react';

const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 };

/** Maps the browser's error codes to the names the UI works with. */
function failureFrom(error) {
  if (error?.code === 1) return 'denied';
  if (error?.code === 3) return 'timeout';
  return 'unavailable';
}

/** One position sample from the Geolocation API. Rejects with 'denied' | 'timeout' | 'unavailable'. */
export function getPosition(fake) {
  if (fake) return Promise.resolve(fake);
  if (!('geolocation' in navigator)) return Promise.reject('unavailable');
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        }),
      (error) => reject(failureFrom(error)),
      GEO_OPTIONS,
    );
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
