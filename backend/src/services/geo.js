const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two WGS 84 points (haversine). */
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Decides one location sample (R-60). Pure: nothing is stored here.
 * Accuracy is checked before distance. Returns 'poor_accuracy', 'outside_radius' or 'verified'.
 */
export function evaluateLocation({ latitude, longitude, accuracy }, checkpoint, maxAccuracyM) {
  if (accuracy > maxAccuracyM) return 'poor_accuracy';
  const distance = distanceMeters(
    latitude,
    longitude,
    Number(checkpoint.latitude),
    Number(checkpoint.longitude),
  );
  return distance <= checkpoint.radius ? 'verified' : 'outside_radius';
}
