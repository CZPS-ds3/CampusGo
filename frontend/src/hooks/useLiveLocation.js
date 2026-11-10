import { useCallback, useEffect, useRef, useState } from 'react';
import { bearingDeg, distanceM } from '../geo.js';

// The live position for the map: watched in the browser and never sent to our server (only the walking route asks
// the OpenStreetMap router, as before). The arrow shows the walking direction from the GPS while moving, otherwise
// the phone's compass when the browser offers one.
const MOVING_MPS = 0.8;
const STEP_M = 8;
const GPS_HEADING_WINS_MS = 3000;
const COMPASS_STEP_DEG = 4;

/** Smallest difference between two directions in degrees (0 to 180). */
const turn = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/**
 * The next walking direction from a reading: the GPS heading while moving, else the direction from the last
 * place the visitor was at least a few metres away from. `anchor` is that place.
 */
export function headingFrom({ coords }, anchor) {
  const here = [coords.latitude, coords.longitude];
  if (Number.isFinite(coords.heading) && coords.speed > MOVING_MPS) {
    return { heading: coords.heading, anchor: here, fromGps: true };
  }
  if (anchor && distanceM(anchor, here) >= STEP_M) {
    return { heading: bearingDeg(anchor, here), anchor: here, fromGps: true };
  }
  return { heading: null, anchor: anchor ?? here, fromGps: false };
}

/** Compass direction from a device orientation event (Android: absolute alpha, iOS: webkitCompassHeading). */
export function compassFrom(event) {
  if (Number.isFinite(event.webkitCompassHeading)) return event.webkitCompassHeading;
  if (event.absolute && Number.isFinite(event.alpha)) return (360 - event.alpha) % 360;
  return null;
}

/**
 * Live location. `status`: off (not asked yet), waiting, on, denied or unavailable. `position` is
 * { lat, lng, accuracy } and `heading` 0-360 or null. Watching starts by itself only when the browser already
 * allows location for this site; otherwise `start()` (from a tap) asks first.
 */
export function useLiveLocation() {
  const [state, setState] = useState({ status: 'off', position: null, heading: null });
  const watch = useRef(null);
  const anchor = useRef(null);
  const gpsHeadingAt = useRef(0);
  const compassOn = useRef(false);

  const onCompass = useCallback((event) => {
    const heading = compassFrom(event);
    if (heading === null || Date.now() - gpsHeadingAt.current < GPS_HEADING_WINS_MS) return;
    setState((now) =>
      now.heading !== null && turn(now.heading, heading) < COMPASS_STEP_DEG
        ? now
        : { ...now, heading },
    );
  }, []);

  const listenToCompass = useCallback(() => {
    if (compassOn.current) return;
    compassOn.current = true;
    window.addEventListener('deviceorientationabsolute', onCompass);
    window.addEventListener('deviceorientation', onCompass);
  }, [onCompass]);

  const start = useCallback(() => {
    // iOS only shares the compass after a tap; without it the arrow follows the walking direction instead.
    const ask = window.DeviceOrientationEvent?.requestPermission;
    if (typeof ask === 'function') {
      // A refusal is an answer, not a fault: the arrow then follows the walking direction.
      ask().then(
        (answer) => answer === 'granted' && listenToCompass(),
        () => undefined,
      );
    } else {
      listenToCompass();
    }
    if (watch.current !== null) return;
    if (!navigator.geolocation) {
      setState((now) => ({ ...now, status: 'unavailable' }));
      return;
    }
    setState((now) => ({ ...now, status: now.position ? 'on' : 'waiting' }));
    watch.current = navigator.geolocation.watchPosition(
      (reading) => {
        const next = headingFrom(reading, anchor.current);
        anchor.current = next.anchor;
        if (next.fromGps) gpsHeadingAt.current = Date.now();
        setState((now) => ({
          ...now,
          status: 'on',
          position: {
            lat: reading.coords.latitude,
            lng: reading.coords.longitude,
            accuracy: reading.coords.accuracy,
          },
          heading: next.heading ?? now.heading,
        }));
      },
      (error) => {
        if (error.code === 1) {
          navigator.geolocation.clearWatch(watch.current);
          watch.current = null;
          setState({ status: 'denied', position: null, heading: null });
        } else {
          setState((now) => (now.position ? now : { ...now, status: 'unavailable' }));
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }, [listenToCompass]);

  // Only a site that is already allowed starts at once, so the map never asks for location without a tap.
  useEffect(() => {
    let live = true;
    // A browser that cannot say (no Permissions API, or it rejects) simply waits for the tap.
    navigator.permissions?.query({ name: 'geolocation' }).then(
      (permission) => live && permission.state === 'granted' && start(),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [start]);

  useEffect(
    () => () => {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
      window.removeEventListener('deviceorientationabsolute', onCompass);
      window.removeEventListener('deviceorientation', onCompass);
      compassOn.current = false;
    },
    [onCompass],
  );

  return { ...state, start };
}
