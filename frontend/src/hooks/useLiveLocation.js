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

// The browser's watch reports only when the device decides to; standing still, or in a browser that saves power,
// it can stay quiet for a long time. So the ball gets a new reading at least every REFRESH_MS: when the watch has
// been quiet for REFRESH_MS - ASK_AHEAD_MS, it is restarted, and a new watch (maximumAge 0) starts with a fresh fix
// (a warm GPS answers within about a second). A restarted watch that is still waiting is given REARM_GRACE_MS before
// the next restart, so a slow fix is not cut off again and again. Nothing is restarted while the tab is hidden (no
// battery spent for an unseen map). A watch is restarted rather than a one-off reading asked for: a one-off reading
// cannot be cancelled when the map closes, and a browser with a simulated position (DevTools, browser tests) never
// answers it while a watch runs and then holds back the next page's location check as well.
export const REFRESH_MS = 3000;
export const ASK_AHEAD_MS = 1000;
export const REARM_GRACE_MS = 6000;
const REFRESH_CHECK_MS = 250;

// How far the true position can drift from the prediction per second, as a variance (m²/s): a person changing pace
// or turning. Smaller smooths more, larger follows quicker.
const DRIFT_M2_PER_S = 9;
const M_PER_DEG = 111320;

/** A position moved `east` and `north` metres. */
function moved({ lat, lng }, east, north) {
  return {
    lat: lat + north / M_PER_DEG,
    lng: lng + east / (M_PER_DEG * Math.cos((lat * Math.PI) / 180)),
  };
}

// How quickly the walking speed follows the readings when the GPS does not report one, and the fastest pace it may
// reach, so GPS jitter while standing never turns into a drift.
const SPEED_GAIN = 0.35;
const MAX_SPEED_MPS = 3;
const TRUSTED_FIX_M = 15;

/** The walking velocity [east, north] in m/s the GPS reported with a fix, or null without one. */
function gpsVelocity({ speed, heading }) {
  if (!Number.isFinite(speed) || !Number.isFinite(heading)) return null;
  const angle = (heading * Math.PI) / 180;
  return [speed * Math.sin(angle), speed * Math.cos(angle)];
}

/**
 * The shown position from the readings so far, like a phone's fused location (a small Kalman filter). The last
 * position is first moved on by the walking velocity (the one the GPS reported, else one learned from the readings),
 * then each new fix is weighed by its accuracy against it: GPS jitter is smoothed out, a coarse Wi-Fi fix hardly
 * moves a precise one, and the ball keeps up with a walking visitor instead of trailing behind. A fix far outside
 * both accuracies is a real jump and is taken as it is. A fix is { lat, lng, accuracy (m), time (ms), speed (m/s)
 * and heading (degrees) or null }; the result also carries `velocity` and `raw` (the last fix as it came).
 * A fix older than the last one, or the same fix delivered again, is not new evidence: `shown` is returned as it
 * is, so the shown accuracy never shrinks from counting one reading twice.
 */
export function fuseFix(shown, fix) {
  const raw = { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, time: fix.time };
  const fresh = { ...fix, raw, velocity: gpsVelocity(fix) ?? [0, 0] };
  if (!shown) return fresh;
  const again =
    fix.time === shown.raw?.time &&
    fix.lat === shown.raw.lat &&
    fix.lng === shown.raw.lng &&
    fix.accuracy === shown.raw.accuracy;
  if (fix.time < shown.time || again || !Number.isFinite(fix.accuracy)) return shown;
  const seconds = Math.max(0, (fix.time - shown.time) / 1000);
  const [east, north] = shown.velocity ?? [0, 0];
  const ahead = moved(shown, east * seconds, north * seconds);
  const variance = shown.accuracy ** 2 + DRIFT_M2_PER_S * seconds;
  const off = distanceM([ahead.lat, ahead.lng], [fix.lat, fix.lng]);
  // Further off than 2.5 times the combined uncertainty of the estimate and the fix: a real move, taken as it is.
  if (off > 2.5 * Math.sqrt(variance + fix.accuracy ** 2)) return fresh;
  const gain = variance / (variance + fix.accuracy ** 2);
  const lat = ahead.lat + gain * (fix.lat - ahead.lat);
  const lng = ahead.lng + gain * (fix.lng - ahead.lng);
  return {
    ...fix,
    lat,
    lng,
    accuracy: Math.sqrt((1 - gain) * variance),
    raw,
    velocity: learn(),
  };

  /** The velocity for the next step: the GPS's own, else nudged by how far this fix was from the prediction. */
  function learn() {
    const reported = gpsVelocity(fix);
    if (reported) return reported;
    if (!seconds || fix.accuracy > TRUSTED_FIX_M) return [east, north];
    const missE = (fix.lng - ahead.lng) * M_PER_DEG * Math.cos((lat * Math.PI) / 180);
    const missN = (fix.lat - ahead.lat) * M_PER_DEG;
    const next = [east + (SPEED_GAIN * missE) / seconds, north + (SPEED_GAIN * missN) / seconds];
    const speed = Math.hypot(...next);
    return speed > MAX_SPEED_MPS ? next.map((v) => (v * MAX_SPEED_MPS) / speed) : next;
  }
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
  // When the last reading came and when the watch was last restarted (browser clock, REFRESH_MS).
  const lastReadingAt = useRef(0);
  const refresh = useRef({ timer: null, rearmedAt: 0 });

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
    const stopRefresh = () => {
      clearInterval(refresh.current.timer);
      refresh.current = { timer: null, rearmedAt: 0 };
    };
    const onFailure = (error) => {
      if (error.code === 1) {
        navigator.geolocation.clearWatch(watch.current);
        watch.current = null;
        stopRefresh();
        setState({ status: 'denied', position: null, heading: null });
      } else {
        setState((now) => (now.position ? now : { ...now, status: 'unavailable' }));
      }
    };
    const onReading = (reading) => {
      lastReadingAt.current = Date.now();
      const fix = {
        lat: reading.coords.latitude,
        lng: reading.coords.longitude,
        accuracy: reading.coords.accuracy,
        time: reading.timestamp ?? Date.now(),
        speed: reading.coords.speed,
        heading: reading.coords.heading,
      };
      const fused = fuseFix(shown.current, fix);
      if (fused === shown.current) return;
      shown.current = fused;
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
        position: { lat: fused.lat, lng: fused.lng, accuracy: fused.accuracy },
        heading: next.heading ?? now.heading,
      }));
    };
    // Always a fresh fix from the GPS (never a cached one), as precise as the device can give.
    const watchNow = () =>
      navigator.geolocation.watchPosition(onReading, onFailure, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      });
    lastReadingAt.current = Date.now();
    watch.current = watchNow();
    stopRefresh();
    refresh.current.timer = setInterval(() => {
      const now = Date.now();
      const quiet = now - lastReadingAt.current >= REFRESH_MS - ASK_AHEAD_MS;
      // A restart that has not answered yet keeps its grace time.
      const waiting =
        refresh.current.rearmedAt > lastReadingAt.current &&
        now - refresh.current.rearmedAt < REARM_GRACE_MS;
      if (!quiet || waiting || document.hidden || watch.current === null) return;
      navigator.geolocation.clearWatch(watch.current);
      refresh.current.rearmedAt = now;
      watch.current = watchNow();
    }, REFRESH_CHECK_MS);
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
      clearInterval(refresh.current.timer);
      refresh.current = { timer: null, rearmedAt: 0 };
      window.removeEventListener('deviceorientationabsolute', onCompass);
      window.removeEventListener('deviceorientation', onCompass);
      compassOn.current = false;
    },
    [onCompass],
  );

  return { ...state, start };
}
