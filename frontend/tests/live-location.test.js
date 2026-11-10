import { describe, expect, it } from 'vitest';
import { bearingDeg, distanceM, insideMapArea, leadIn, routeProgress } from '../src/geo.js';
import { compassFrom, headingFrom } from '../src/hooks/useLiveLocation.js';

// Test positions are made up near the Bildungscampus; no real student location is used.
const A = [49.148, 9.216];
const NORTH_OF_A = [49.149, 9.216]; // about 111 m north
const EAST_OF_A = [49.148, 9.2175]; // about 109 m east

const reading = (lat, lng, extra = {}) => ({
  coords: { latitude: lat, longitude: lng, accuracy: 10, heading: null, speed: null, ...extra },
});

describe('geometry for the live position', () => {
  it('measures distances and compass directions', () => {
    expect(distanceM(A, NORTH_OF_A)).toBeCloseTo(111.2, 0);
    expect(bearingDeg(A, NORTH_OF_A)).toBeCloseTo(0, 5);
    expect(bearingDeg(A, EAST_OF_A)).toBeCloseTo(90, 0);
    expect(bearingDeg(NORTH_OF_A, A)).toBeCloseTo(180, 5);
  });

  it('BR51 knows whether a position is inside the map area', () => {
    expect(insideMapArea(A)).toBe(true);
    expect(insideMapArea([52.52, 13.4])).toBe(false);
  });
});

describe('progress along the walking route', () => {
  const route = [A, NORTH_OF_A, [49.149, 9.2175]];

  it('draws only the part still ahead, starting where the visitor is on the route', () => {
    const halfway = [49.1485, 9.216];
    const progress = routeProgress(route, halfway);
    expect(progress.offRouteM).toBeLessThan(0.5);
    expect(progress.points[0][0]).toBeCloseTo(49.1485, 6);
    expect(progress.points).toHaveLength(3);
    expect(progress.meters).toBeCloseTo(55.6 + 109.2, -1);
  });

  it('notices a wrong turn by the distance from the route', () => {
    const wrong = [49.1485, 9.2168]; // about 58 m east of the first leg
    expect(routeProgress(route, wrong).offRouteM).toBeGreaterThan(40);
  });

  it('counts nothing left at the end of the route', () => {
    expect(routeProgress(route, [49.149, 9.2175]).meters).toBe(0);
    expect(routeProgress([A], A)).toEqual({ points: [A], meters: 0, offRouteM: 0 });
  });
});

describe('dotted lead-in to the route', () => {
  // North for about 111 m, then east.
  const route = [A, NORTH_OF_A, [49.149, 9.2175]];
  /** Smallest angle between two compass directions, 0 to 180. */
  const between = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const turnOf = (curve) =>
    between(bearingDeg(curve[0], curve[1]), bearingDeg(curve.at(-2), curve.at(-1)));

  it('beside the route: sweeps into it a little later, meeting it in the route direction', () => {
    const visitor = [49.148, 9.2165]; // about 36 m east of the start
    const { curve, route: solid } = leadIn(visitor, route);
    expect(curve[0][0]).toBeCloseTo(visitor[0], 8);
    expect(curve[0][1]).toBeCloseTo(visitor[1], 8);
    // It joins about as far along the route as the visitor is away from it, not at the nearest point.
    expect(distanceM(A, curve.at(-1))).toBeGreaterThan(25);
    expect(curve.at(-1)[1]).toBeCloseTo(A[1], 6);
    expect(solid[0]).toEqual(curve.at(-1));
    expect(solid.at(-1)).toEqual(route.at(-1));
    // Arrives heading north, like the route.
    expect(between(bearingDeg(curve.at(-2), curve.at(-1)), 0)).toBeLessThan(5);
  });

  it('never turns by more than 90 degrees, wherever the visitor stands', () => {
    const around = [
      [49.148, 9.2165], // east
      [49.148, 9.2155], // west
      [49.1477, 9.216], // behind the start
      [49.1477, 9.2163], // behind and to the side
      [49.1485, 9.2163], // beside the middle of the first leg
      [49.1483, 9.2154], // to the side, further along
    ];
    for (const visitor of around) {
      const lead = leadIn(visitor, route);
      expect(lead, String(visitor)).not.toBeNull();
      expect(turnOf(lead.curve), String(visitor)).toBeLessThanOrEqual(90.5);
    }
  });

  it('when the route starts by leading back past the visitor, draws a straight dotted line', () => {
    const backwards = [A, [49.1475, 9.216]]; // a short route south
    const visitor = [49.147, 9.216]; // past its end: every join point lies behind the visitor
    const { curve, route: solid } = leadIn(visitor, backwards);
    expect(curve).toEqual([visitor, A]);
    expect(solid).toBe(backwards);
  });

  it('is left out when the visitor is already on the route', () => {
    expect(leadIn([49.14801, 9.216], route)).toBeNull();
    expect(leadIn(A, [])).toBeNull();
  });
});

describe('direction of the arrow', () => {
  it('uses the GPS heading while the visitor is moving', () => {
    const next = headingFrom(reading(...A, { heading: 75, speed: 1.4 }), null);
    expect(next).toMatchObject({ heading: 75, fromGps: true });
  });

  it('ignores the GPS heading when standing still and takes the walked direction after a few metres', () => {
    const still = headingFrom(reading(...A, { heading: 75, speed: 0 }), null);
    expect(still.heading).toBeNull();
    const shuffle = headingFrom(reading(49.14802, 9.216), still.anchor); // about 2 m
    expect(shuffle.heading).toBeNull();
    const walked = headingFrom(reading(...NORTH_OF_A), still.anchor);
    expect(walked.heading).toBeCloseTo(0, 5);
    expect(walked.anchor).toEqual(NORTH_OF_A);
  });

  it('reads the compass on Android (absolute alpha) and iOS (webkitCompassHeading)', () => {
    expect(compassFrom({ absolute: true, alpha: 90 })).toBe(270);
    expect(compassFrom({ webkitCompassHeading: 42 })).toBe(42);
    expect(compassFrom({ absolute: false, alpha: 90 })).toBeNull();
  });
});
