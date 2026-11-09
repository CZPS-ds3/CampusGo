/**
 * The area of the map students can see. Quests (checkpoints) can only be placed inside it (BR51).
 * The student map (`frontend/src/components/MapView.jsx`) uses the same corners; a test keeps both in step.
 */
export const MAP_AREA = Object.freeze({
  south: 49.12,
  west: 9.17,
  north: 49.18,
  east: 9.26,
});

/** True when the point lies inside the map area students can see. */
export const insideMapArea = (lat, lng) =>
  lat >= MAP_AREA.south && lat <= MAP_AREA.north && lng >= MAP_AREA.west && lng <= MAP_AREA.east;
