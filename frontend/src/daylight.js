import { useSyncExternalStore } from 'react';

// Day or night on the campus, from the position of the sun over Heilbronn. The sun does not care about clocks, so
// this follows German time by itself, summer time included. No open night aerial photo of Heilbronn exists, so at
// night the aerial photo of the day is shown with a night look (map-3d.js, screens.css).

const RAD = Math.PI / 180;
const CAMPUS = { lat: 49.1485, lng: 9.2165 };
// The sun's centre this far below the horizon is sunset (refraction and the sun's radius).
const SUNSET_DEG = -0.833;
const CHECK_MS = 60_000;

/** Height of the sun above the horizon in degrees at `date` for a place (a standard approximation, ±0.1 degree). */
export function sunElevation(date, { lat, lng } = CAMPUS) {
  const days = date.getTime() / 86_400_000 - 10_957.5; // days since 2000-01-01 12:00 UTC
  const anomaly = RAD * ((357.529 + 0.98560028 * days) % 360);
  const meanLongitude = (280.459 + 0.98564736 * days) % 360;
  const longitude =
    RAD * (meanLongitude + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly));
  const tilt = RAD * (23.439 - 0.00000036 * days);
  const declination = Math.asin(Math.sin(tilt) * Math.sin(longitude));
  const rightAscension = Math.atan2(Math.cos(tilt) * Math.sin(longitude), Math.cos(longitude));
  const siderealHours = (18.697374558 + 24.06570982441908 * days) % 24;
  const hourAngle = RAD * (siderealHours * 15 + lng) - rightAscension;
  const height = Math.asin(
    Math.sin(RAD * lat) * Math.sin(declination) +
      Math.cos(RAD * lat) * Math.cos(declination) * Math.cos(hourAngle),
  );
  return height / RAD;
}

/** Whether the sun has set on the campus at `date`. */
export const isNight = (date = new Date()) => sunElevation(date) < SUNSET_DEG;

let night = isNight();
const subscribers = new Set();
let timer = null;

/** Night or day on the campus, checked every minute while something on the page needs it. */
export function useNight() {
  return useSyncExternalStore(
    (notify) => {
      subscribers.add(notify);
      if (!timer) {
        timer = setInterval(() => {
          const now = isNight();
          if (now === night) return;
          night = now;
          for (const tell of subscribers) tell();
        }, CHECK_MS);
      }
      return () => {
        subscribers.delete(notify);
        if (subscribers.size === 0) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    () => night,
  );
}
