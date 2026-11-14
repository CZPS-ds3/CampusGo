// Numbers and wording for the checkpoint radius editor. The server accepts 10-500 m (checkpoint-admin.js); the
// slider covers the sizes that make sense on the campus, the number field accepts the whole range.
export const RADIUS_MIN = 10;
export const RADIUS_MAX = 500;
export const SLIDER_MIN = 20;
export const SLIDER_MAX = 200;
export const SLIDER_STEP = 5;
export const DEFAULT_GRACE_M = 10;
export const RADIUS_PRESETS = [25, 35, 50, 80];

/** The radius to draw: the typed number when it is valid, otherwise the nearest valid one. NaN when empty. */
export function drawableRadius(text) {
  const value = Number(text);
  if (String(text).trim() === '' || !Number.isFinite(value)) return Number.NaN;
  return Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, Math.round(value)));
}

/** Null when the text is a whole number the server accepts, otherwise 'format' or 'range'. */
export function radiusProblem(text) {
  const value = Number(text);
  if (String(text).trim() === '' || !Number.isInteger(value)) return 'format';
  if (value < RADIUS_MIN || value > RADIUS_MAX) return 'range';
  return null;
}

/** Distances in metres, or kilometres from 1000 m, as the admin reads them. */
export function formatMetres(metres) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}

/**
 * The checkpoints whose circles touch the circle being edited (their distance is smaller than the two radii
 * added together). Used for the "overlaps" hint: one spot still only ever unlocks the nearest checkpoint.
 */
export function overlappingQuests(centre, radius, others) {
  if (!centre || !Number.isFinite(radius)) return [];
  const rad = Math.PI / 180;
  return others.filter((other) => {
    const dLat = (other.lat - centre.lat) * rad;
    const dLng = (other.lng - centre.lng) * rad;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(centre.lat * rad) * Math.cos(other.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h)) < radius + other.radius;
  });
}
