// Geofencing maths (Main Project Document, "Geofencing Architecture" 6.1 and Figure 3). Pure: nothing is stored here.
const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Straight-line (great-circle) distance in metres between two latitude/longitude points (Haversine). */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
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
