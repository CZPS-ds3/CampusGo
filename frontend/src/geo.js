// Small geometry helpers for the live position and the walking route. Positions are [lat, lng] arrays and stay in
// the browser: nothing here is sent to our server.
import { MAP_AREA } from './api/mapLink.js';

const EARTH_M = 6371008.8;
const rad = (degrees) => (degrees * Math.PI) / 180;

// WGS84, the ellipsoid GPS positions are given on (the same formula as the server's backend/src/services/geo.js).
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * (1 - WGS84_F);

/** Great-circle distance on a sphere; used only where the ellipsoid formula does not converge. */
function sphereDistance([lat1, lng1], [lat2, lng2]) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Distance in metres on the WGS84 ellipsoid (Vincenty's inverse formula, millimetre-exact). */
export function distanceM(from, to) {
  const [lat1, lng1] = from;
  const [lat2, lng2] = to;
  if (lat1 === lat2 && lng1 === lng2) return 0;
  const f = WGS84_F;
  const L = rad(lng2 - lng1);
  const U1 = Math.atan((1 - f) * Math.tan(rad(lat1)));
  const U2 = Math.atan((1 - f) * Math.tan(rad(lat2)));
  const [sinU1, cosU1, sinU2, cosU2] = [Math.sin(U1), Math.cos(U1), Math.sin(U2), Math.cos(U2)];
  let lambda = L;
  for (let i = 0; i < 200; i += 1) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    const sinSigma = Math.hypot(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
    if (sinSigma === 0) return 0;
    const cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    const sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    const cos2Alpha = 1 - sinAlpha ** 2;
    const cos2SigmaM = cos2Alpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cos2Alpha;
    const C = (f / 16) * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha));
    const previous = lambda;
    lambda =
      L +
      (1 - C) *
        f *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
    if (Math.abs(lambda - previous) < 1e-12) {
      const u2 = (cos2Alpha * (WGS84_A ** 2 - WGS84_B ** 2)) / WGS84_B ** 2;
      const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
      const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
      const deltaSigma =
        B *
        sinSigma *
        (cos2SigmaM +
          (B / 4) *
            (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
              (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));
      return WGS84_B * A * (sigma - deltaSigma);
    }
  }
  return sphereDistance(from, to);
}

/** Compass direction from one position to another: 0 = north, 90 = east, always 0 to <360. */
export function bearingDeg([lat1, lng1], [lat2, lng2]) {
  const y = Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2));
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
    Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** True when a position lies in the area that the map shows (BR51). */
export const insideMapArea = ([lat, lng]) =>
  lat >= MAP_AREA.south && lat <= MAP_AREA.north && lng >= MAP_AREA.west && lng <= MAP_AREA.east;

/** Metres on a flat plane around `origin`; exact enough for the few hundred metres of a campus walk. */
function toPlane([lat, lng], origin) {
  return {
    x: rad(lng - origin[1]) * Math.cos(rad(origin[0])) * EARTH_M,
    y: rad(lat - origin[0]) * EARTH_M,
  };
}

/**
 * Where the visitor is on a walking route: the part still ahead (starting at the nearest point of the route), its
 * length in metres, and how far the visitor is from the route (to notice a wrong turn).
 */
export function routeProgress(points, here) {
  if (points.length < 2) return { points, meters: 0, offRouteM: 0 };
  let best = { distance: Infinity, index: 0, point: points[0] };
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = toPlane(points[i], here);
    const b = toPlane(points[i + 1], here);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / length2));
    const distance = Math.hypot(a.x + t * dx, a.y + t * dy);
    if (distance < best.distance) {
      const [lat1, lng1] = points[i];
      const [lat2, lng2] = points[i + 1];
      best = { distance, index: i, point: [lat1 + t * (lat2 - lat1), lng1 + t * (lng2 - lng1)] };
    }
  }
  const ahead = [best.point, ...points.slice(best.index + 1)];
  let meters = 0;
  for (let i = 1; i < ahead.length; i += 1) meters += distanceM(ahead[i - 1], ahead[i]);
  return { points: ahead, meters: Math.round(meters), offRouteM: best.distance };
}

const LEAD_MIN_M = 3;
const LEAD_MAX_JOIN_M = 60;
/** Join points tried, as multiples of the visitor's distance from the route. */
const JOIN_FACTORS = [1, 1.5, 2, 3];

/** A position on the flat plane around `origin` back to [lat, lng]. */
const fromPlane = ({ x, y }, origin) => [
  origin[0] + (y / EARTH_M) * (180 / Math.PI),
  origin[1] + (x / (EARTH_M * Math.cos(rad(origin[0])))) * (180 / Math.PI),
];

/** The point `metres` along a route (flat plane around `origin`), its segment and the route's direction there. */
function along(points, metres, origin) {
  let left = metres;
  let last = null;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = toPlane(points[i], origin);
    const b = toPlane(points[i + 1], origin);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > 0) {
      const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
      const t = Math.min(left, length);
      last = { at: { x: a.x + dir.x * t, y: a.y + dir.y * t }, index: i, dir };
      if (left <= length) return last;
      left -= length;
    }
  }
  return last;
}

const routeLength = (points) =>
  points.slice(1).reduce((sum, point, i) => sum + distanceM(points[i], point), 0);

/**
 * The dotted "walk to the route" of a navigation app: a curve from the visitor that joins the walking route a
 * little after its start, so it can sweep into it, and meets it in the route's own direction. The curve never
 * turns by more than 90 degrees (a quadratic curve turns by the angle between its two end directions, and its
 * middle point is placed so that this angle stays at or below 90). Returns { curve, route }, where `route` is
 * the solid part from the join on, or null when the visitor is already on the route.
 */
export function leadIn(from, points, steps = 16) {
  if (points.length < 2) return null;
  const origin = points[0];
  const visitor = toPlane(from, origin);
  const offset = Math.hypot(visitor.x, visitor.y);
  if (offset < LEAD_MIN_M) return null;
  const longest = Math.min(LEAD_MAX_JOIN_M, routeLength(points));

  let join = null;
  for (const factor of JOIN_FACTORS) {
    const candidate = along(points, Math.min(offset * factor, longest), origin);
    if (!candidate) break;
    const gap = { x: candidate.at.x - visitor.x, y: candidate.at.y - visitor.y };
    // How far the join lies ahead of the visitor in the route's direction; above zero allows a curve of at most
    // 90 degrees, and half the gap or more makes a gentle one.
    const ahead = gap.x * candidate.dir.x + gap.y * candidate.dir.y;
    if (ahead > 0 && !join) join = { ...candidate, ahead };
    if (ahead >= 0.5 * Math.hypot(gap.x, gap.y)) {
      join = { ...candidate, ahead };
      break;
    }
  }
  // No join ahead of the visitor (the route starts by leading back): a straight dotted line, which does not bend.
  if (!join) return { curve: [from, origin], route: points };

  const control = {
    x: join.at.x - join.dir.x * join.ahead,
    y: join.at.y - join.dir.y * join.ahead,
  };
  const curve = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    curve.push(
      fromPlane(
        {
          x: u * u * visitor.x + 2 * u * t * control.x + t * t * join.at.x,
          y: u * u * visitor.y + 2 * u * t * control.y + t * t * join.at.y,
        },
        origin,
      ),
    );
  }
  return { curve, route: [curve.at(-1), ...points.slice(join.index + 1)] };
}
