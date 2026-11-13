// Distances on the WGS84 ellipsoid (BR12): the reference values are the published geodesic distances, not results
// of the code under test. No database; all positions are public survey points or invented.
import { describe, expect, it } from 'vitest';
import { distanceMeters, evaluateLocation } from '../src/services/geo.js';

const A = 6378137;
const E2 = 0.00669437999014; // WGS84 first eccentricity squared
const rad = (deg) => (deg * Math.PI) / 180;

/** Degrees of longitude for `metres` east along the parallel at `lat` on WGS84 (N·cosφ·Δλ). */
const eastDegrees = (lat, metres) =>
  (metres / ((A / Math.sqrt(1 - E2 * Math.sin(rad(lat)) ** 2)) * Math.cos(rad(lat))) / Math.PI) *
  180;

/** The old spherical (Haversine, R = 6371 km) distance, to show what it got wrong. */
function sphere(lat1, lng1, lat2, lng2) {
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

describe('BR12 distances are measured on the WGS84 ellipsoid that GPS uses', () => {
  it('BR12 one degree of longitude on the equator is 111 319.491 m', () => {
    expect(Math.abs(distanceMeters(0, 0, 0, 1) - 111319.491)).toBeLessThan(0.001);
  });

  it('BR12 one degree of latitude from the equator is 110 574.389 m', () => {
    expect(Math.abs(distanceMeters(0, 0, 1, 0) - 110574.389)).toBeLessThan(0.001);
  });

  it("BR12 Vincenty's survey example (Flinders Peak to Buninyong) is 54 972.271 m", () => {
    const flinders = [-(37 + 57 / 60 + 3.7203 / 3600), 144 + 25 / 60 + 29.5244 / 3600];
    const buninyong = [-(37 + 39 / 60 + 10.1561 / 3600), 143 + 55 / 60 + 35.3839 / 3600];
    expect(Math.abs(distanceMeters(...flinders, ...buninyong) - 54972.271)).toBeLessThan(0.01);
  });

  it('BR12 an east-west distance on the campus matches the WGS84 parallel to the millimetre', () => {
    const lat = 49.148;
    expect(
      Math.abs(distanceMeters(lat, 9.2167, lat, 9.2167 + eastDegrees(lat, 120)) - 120),
    ).toBeLessThan(0.001);
  });

  it('BR12 the distance is the same in both directions and 0 for one point', () => {
    const there = distanceMeters(49.148464, 9.215808, 49.147126, 9.218486);
    expect(distanceMeters(49.147126, 9.218486, 49.148464, 9.215808)).toBeCloseTo(there, 9);
    expect(distanceMeters(49.147126, 9.218486, 49.147126, 9.218486)).toBe(0);
  });

  it('BR12 nearly opposite points (where the formula does not converge) still get a distance', () => {
    const d = distanceMeters(0, 0, 0.5, 179.7);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(19_900_000);
    expect(d).toBeLessThan(20_040_000);
  });

  it('BR12 a reading just outside the circle east of the centre is outside (the sphere let it in)', () => {
    const centre = { latitude: 49.148, longitude: 9.2167, radius: 80 };
    const limits = {
      maxAccuracyM: 200,
      maxPositionAgeMs: 30_000,
      geofenceSlackM: 30,
      accuracyCreditM: 50,
    };
    // Edge = 80 m radius + 30 m grace + 10 m accuracy credit = 120 m; the reading is 120.2 m east.
    const lng = centre.longitude + eastDegrees(centre.latitude, 120.2);
    expect(sphere(centre.latitude, centre.longitude, centre.latitude, lng)).toBeLessThan(120);
    const reading = { lat: centre.latitude, lng, accuracy: 10, ageMs: 0 };
    expect(evaluateLocation(reading, centre, limits).outcome).toBe('outside');
    const inside = { ...reading, lng: centre.longitude + eastDegrees(centre.latitude, 119.8) };
    expect(evaluateLocation(inside, centre, limits).outcome).toBe('inside');
  });
});
