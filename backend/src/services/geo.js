// Geofencing maths (Main Project Document, "Geofencing Architecture" 6.1 and Figure 3). Pure: nothing is stored here.
const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

// WGS84, the ellipsoid GPS positions are given on. A sphere is up to 0.5 % off (about 0.3 % east-west at Heilbronn),
// which is enough to move the edge of an 80 m circle by a few decimetres.
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * (1 - WGS84_F);

/** Great-circle distance on a sphere (Haversine); used only where the ellipsoid formula does not converge. */
function sphereDistance(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Distance in metres between two latitude/longitude points on the WGS84 ellipsoid (Vincenty's inverse formula,
 * millimetre-exact). Nearly opposite points, where it does not converge, fall back to the sphere.
 */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  if (lat1 === lat2 && lng1 === lng2) return 0;
  const f = WGS84_F;
  const L = toRad(lng2 - lng1);
  const U1 = Math.atan((1 - f) * Math.tan(toRad(lat1)));
  const U2 = Math.atan((1 - f) * Math.tan(toRad(lat2)));
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
    // On the equator cos²α is 0 and the term below is not needed.
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
  return sphereDistance(lat1, lng1, lat2, lng2);
}

/** Distance shown to the student, rounded to 10 m so it is a hint and not a precise position. */
export const roundedDistance = (metres) => Math.round(metres / 10) * 10;

/**
 * Decides one location reading in the order of Figure 3: fresh enough, then precise enough, then inside
 * the circle. Returns { outcome } where outcome is 'stale' | 'poor_accuracy' | 'outside' | 'elsewhere' |
 * 'inside', plus `distanceM` (rounded, to this checkpoint) once the distance was computed.
 *
 * Circles may overlap (Building C and the Sensoricum are 34 m apart). A reading inside several circles belongs
 * to the checkpoint with the nearest centre only, so one spot can never unlock two checkpoints:
 * 'elsewhere' names that nearer checkpoint (a tie goes to the lower id).
 * @param {{ lat: number, lng: number, accuracy: number, ageMs: number }} reading
 * @param {{ checkpoint_id?: number, latitude: number|string, longitude: number|string, radius: number }} checkpoint
 * @param {{ maxAccuracyM: number, maxPositionAgeMs: number, geofenceSlackM?: number, accuracyCreditM?: number, nearerMarginM?: number }} limits
 * @param {{ checkpoint_id: number, checkpoint_name: string, latitude: number|string, longitude: number|string, radius: number }[]} others
 *   the other ACTIVE checkpoints
 */
export function evaluateLocation(reading, checkpoint, limits, others = []) {
  if (reading.ageMs < 0 || reading.ageMs > limits.maxPositionAgeMs) return { outcome: 'stale' };
  if (reading.accuracy > limits.maxAccuracyM) return { outcome: 'poor_accuracy' };
  const distanceTo = (c) =>
    distanceMeters(reading.lat, reading.lng, Number(c.latitude), Number(c.longitude));
  const distance = distanceTo(checkpoint);
  const distanceM = roundedDistance(distance);
  // Phones are rarely exact indoors, so the circle gets a grace zone (GEOFENCE_SLACK_M) on top of its radius,
  // plus the reading's own error margin: a phone that says "within 30 m" may really be 30 m closer. That credit
  // is capped (ACCURACY_CREDIT_M) so a very vague reading cannot reach a checkpoint from far away.
  const credit = Math.min(reading.accuracy, limits.accuracyCreditM ?? 0);
  if (distance > checkpoint.radius + (limits.geofenceSlackM ?? 0) + credit) {
    return { outcome: 'outside', distanceM };
  }

  // Another checkpoint only wins when its centre is clearly nearer (NEARER_MARGIN_M), so GPS jitter between
  // two close checkpoints does not send a student away.
  const margin = limits.nearerMarginM ?? 0;
  let nearer = null;
  let nearerDistance = distance;
  for (const other of others) {
    const d = distanceTo(other);
    const wins =
      d + margin < nearerDistance ||
      (margin === 0 && d === nearerDistance && other.checkpoint_id < checkpoint.checkpoint_id);
    if (d <= other.radius && wins) {
      nearer = other;
      nearerDistance = d;
    }
  }
  if (nearer) return { outcome: 'elsewhere', distanceM, elsewhere: nearer.checkpoint_name };
  return { outcome: 'inside', distanceM };
}
