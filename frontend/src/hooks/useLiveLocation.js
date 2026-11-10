import { useCallback, useEffect, useRef, useState } from 'react';
import { bearingDeg, distanceM } from '../geo.js';

// The live position for the map: watched in the browser and never sent to our server (only the walking route asks
// the OpenStreetMap router, as before). The arrow shows the walking direction from the GPS while moving, otherwise
// the device's compass or gyroscope when the browser offers one (phones, tablets and PCs with orientation sensors).
const MOVING_MPS = 0.8;
const STEP_M = 8;
const GPS_HEADING_WINS_MS = 3000;
const COMPASS_STEP_DEG = 4;

/** Smallest difference between two directions in degrees (0 to 180). */
const turn = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/** A direction folded into 0 to under 360 degrees. */
const wrap = (deg) => ((deg % 360) + 360) % 360;

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

const BETTER_FIX_WINS_MS = 10000;

/**
 * Whether a new reading should replace the shown position. A much coarser reading (say a 60 m Wi-Fi fix right after
 * a 5 m GPS fix) is ignored for a few seconds unless it shows a real move, so the ball does not jump off the
 * visitor's actual spot; after that, or when the visitor clearly moved, the new reading always wins.
 */
export function keepReading(shown, next) {
  if (!shown) return true;
  if (next.accuracy <= shown.accuracy * 1.5) return true;
  if (next.time - shown.time > BETTER_FIX_WINS_MS) return true;
  return distanceM([shown.lat, shown.lng], [next.lat, next.lng]) > shown.accuracy + next.accuracy;
}

/** How far the screen is turned from the device's natural position (0, 90, 180 or 270), so sideways works too. */
export function screenAngle() {
  const angle = window.screen?.orientation?.angle ?? window.orientation;
  return Number.isFinite(angle) ? angle : 0;
}

/**
 * The direction the top of the screen faces, from a device orientation event, or null without one.
 * `absolute` readings are measured against north (iOS webkitCompassHeading, absolute alpha on Android and Windows);
 * the others come from a gyroscope alone and only say how far the device has turned since it started (PCs,
 * tablets and browsers without a compass), so the hook lines them up with the walking direction.
 */
export function compassFrom(event, screenTurn = 0) {
  if (Number.isFinite(event.webkitCompassHeading)) {
    return { heading: wrap(event.webkitCompassHeading + screenTurn), absolute: true };
  }
  if (Number.isFinite(event.alpha)) {
    return { heading: wrap(360 - event.alpha + screenTurn), absolute: event.absolute === true };
  }
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
  const shown = useRef(null);
  const gpsHeadingAt = useRef(0);
  const compassOn = useRef(false);
  // A compass (measured against north) wins over the gyroscope once it has been seen.
  const hasCompass = useRef(false);
  // The last gyroscope-only reading and how far to turn such readings to north (from the walking direction).
  const gyro = useRef({ last: null, offset: 0 });

  const onCompass = useCallback((event) => {
    const reading = compassFrom(event, screenAngle());
    if (!reading) return;
    let heading = reading.heading;
    if (reading.absolute) {
      hasCompass.current = true;
    } else {
      if (hasCompass.current) return;
      gyro.current.last = reading.heading;
      heading = wrap(reading.heading + gyro.current.offset);
    }
    if (Date.now() - gpsHeadingAt.current < GPS_HEADING_WINS_MS) return;
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
    // iOS only shares the compass after a tap (Re-center asks on every tap until it is allowed); without it the
    // arrow follows the walking direction instead.
    const ask = window.DeviceOrientationEvent?.requestPermission;
    if (typeof ask === 'function') {
      // A refusal is an answer, not a fault: the arrow then follows the walking direction.
      if (!compassOn.current)
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
        const fix = {
          lat: reading.coords.latitude,
          lng: reading.coords.longitude,
          accuracy: reading.coords.accuracy,
          time: reading.timestamp ?? Date.now(),
        };
        if (!keepReading(shown.current, fix)) return;
        shown.current = fix;
        const next = headingFrom(reading, anchor.current);
        anchor.current = next.anchor;
        if (next.fromGps) {
          gpsHeadingAt.current = Date.now();
          // While walking, the gyroscope learns where north is, so it can turn the arrow when the visitor stops.
          if (gyro.current.last !== null)
            gyro.current.offset = wrap(next.heading - gyro.current.last);
        }
        setState((now) => ({
          ...now,
          status: 'on',
          position: { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy },
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
      // Always a fresh fix from the GPS (never a cached one), as precise as the device can give.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
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
