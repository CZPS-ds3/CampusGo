import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bearingDeg, distanceM, insideMapArea, leadIn, routeProgress } from '../src/geo.js';
import {
  compassFrom,
  headingFrom,
  fuseFix,
  useLiveLocation,
} from '../src/hooks/useLiveLocation.js';

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

  it('reads the compass on Android and Windows (absolute alpha) and iOS (webkitCompassHeading)', () => {
    expect(compassFrom({ absolute: true, alpha: 90 })).toEqual({ heading: 270, absolute: true });
    expect(compassFrom({ webkitCompassHeading: 42 })).toEqual({ heading: 42, absolute: true });
    expect(compassFrom({ alpha: null })).toBeNull();
  });

  it('reads a gyroscope without a compass (PCs, tablets) as a relative turn', () => {
    expect(compassFrom({ absolute: false, alpha: 90 })).toEqual({ heading: 270, absolute: false });
  });

  it('turns the direction with the screen when the device is held sideways', () => {
    expect(compassFrom({ webkitCompassHeading: 300 }, 90).heading).toBe(30);
    expect(compassFrom({ absolute: true, alpha: 0 }, 270).heading).toBe(270);
  });
});

describe('device orientation turns the live arrow', () => {
  const orientation = (type, values) =>
    act(() => {
      window.dispatchEvent(Object.assign(new Event(type), values));
    });

  beforeEach(() => {
    vi.stubGlobal('navigator', {
      ...navigator,
      permissions: undefined,
      geolocation: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() },
    });
  });
  afterEach(() => {
    cleanup(); // unmount while the stubbed geolocation is still there
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('follows the gyroscope on a device without a compass', () => {
    const { result } = renderHook(() => useLiveLocation());
    act(() => result.current.start());
    orientation('deviceorientation', { alpha: 300, absolute: false });
    expect(result.current.heading).toBe(60);
    orientation('deviceorientation', { alpha: 270, absolute: false });
    expect(result.current.heading).toBe(90);
  });

  it('prefers the compass over the gyroscope once a compass reading has come', () => {
    const { result } = renderHook(() => useLiveLocation());
    act(() => result.current.start());
    orientation('deviceorientationabsolute', { alpha: 180, absolute: true });
    expect(result.current.heading).toBe(180);
    orientation('deviceorientation', { alpha: 90, absolute: false });
    expect(result.current.heading).toBe(180);
  });

  it('lines the gyroscope up with the walking direction', () => {
    const { result } = renderHook(() => useLiveLocation());
    act(() => result.current.start());
    const onReading = navigator.geolocation.watchPosition.mock.calls[0][0];
    orientation('deviceorientation', { alpha: 0, absolute: false }); // gyroscope says "north"
    // Walking east at a steady pace: the GPS direction wins and teaches the gyroscope where north is.
    act(() => onReading(reading(...A, { heading: 90, speed: 1.4 })));
    expect(result.current.heading).toBe(90);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000); // standing still later
    orientation('deviceorientation', { alpha: 270, absolute: false }); // turned 90 degrees right
    expect(result.current.heading).toBe(180);
  });
});

describe('the live position is fused from the readings, like a phone does', () => {
  const fix = (north, accuracy, seconds, extra = {}) => ({
    lat: A[0] + north / 111320,
    lng: A[1],
    accuracy,
    time: seconds * 1000,
    speed: null,
    heading: null,
    ...extra,
  });
  const northOfA = (shown) => (shown.lat - A[0]) * 111320;

  it('takes the first reading as it is', () => {
    expect(fuseFix(null, fix(0, 5, 0))).toMatchObject({ ...fix(0, 5, 0), velocity: [0, 0] });
  });

  it('hardly moves a precise GPS fix for a coarse Wi-Fi reading right after it', () => {
    const shown = fuseFix(fix(0, 5, 0), fix(40, 60, 1));
    expect(northOfA(shown)).toBeLessThan(1);
  });

  it('smooths GPS jitter while standing still', () => {
    let shown = null;
    [4, -4, 4, -4, 4, -4, 4, -4].forEach((north, s) => {
      shown = fuseFix(shown, fix(north, 5, s));
    });
    expect(Math.abs(northOfA(shown))).toBeLessThan(2.5); // the readings themselves are 4 m off
    expect(shown.accuracy).toBeLessThan(5);
  });

  it('keeps up with a walking visitor, using the speed and direction the GPS reports', () => {
    let shown = null;
    for (let s = 0; s <= 10; s += 1) {
      shown = fuseFix(shown, fix(1.4 * s, 5, s, { speed: 1.4, heading: 0 }));
    }
    expect(Math.abs(northOfA(shown) - 14)).toBeLessThan(0.5);
  });

  it('keeps up with a walking visitor even when the GPS reports no speed', () => {
    let shown = null;
    for (let s = 0; s <= 20; s += 1) shown = fuseFix(shown, fix(1.4 * s, 5, s));
    expect(Math.abs(northOfA(shown) - 28)).toBeLessThan(1.5);
    expect(shown.velocity[1]).toBeGreaterThan(1);
  });

  it('BR12 counts a fix delivered twice only once, so the accuracy is not overstated', () => {
    const first = fuseFix(fix(0, 5, 0), fix(2, 5, 1));
    expect(fuseFix(first, fix(2, 5, 1))).toBe(first);
  });

  it('BR12 ignores a fix older than the one already shown', () => {
    const shown = fuseFix(fix(0, 5, 0), fix(1, 5, 2));
    expect(fuseFix(shown, fix(30, 5, 1))).toBe(shown);
  });

  it('takes a fix far outside both accuracies as a real jump', () => {
    const shown = fuseFix(fix(0, 5, 0), fix(300, 10, 1));
    expect(northOfA(shown)).toBeCloseTo(300, 0);
  });
});

describe('BR12 small real moves show quickly on the ball', () => {
  const fix = (north, accuracy, seconds) => ({
    lat: A[0] + north / 111_320,
    lng: A[1],
    accuracy,
    time: seconds * 1000,
    speed: null,
    heading: null,
  });
  const northOfA = (p) => distanceM(A, [p.lat, A[1]]) * Math.sign(p.lat - A[0]);

  it('BR12 after settling, a 1 m step with 5 m fixes moves the ball at least 60 % of the way at once', () => {
    let shown = null;
    for (let s = 0; s <= 10; s += 1) shown = fuseFix(shown, fix(0, 5, s));
    shown = fuseFix(shown, fix(1, 5, 11));
    expect(northOfA(shown)).toBeGreaterThan(0.6);
    expect(northOfA(shown)).toBeLessThan(1.01);
  });

  it('BR12 after settling, a 1 m step with 5 m fixes moves the ball about three quarters of the way', () => {
    let shown = null;
    for (let s = 0; s <= 10; s += 1) shown = fuseFix(shown, fix(0, 5, s));
    shown = fuseFix(shown, fix(1, 5, 11));
    expect(northOfA(shown)).toBeGreaterThan(0.7);
  });

  it('BR12 after a long still stretch a precise fix still moves the ball at least half way', () => {
    let shown = null;
    for (let s = 0; s <= 120; s += 0.2) shown = fuseFix(shown, fix(0, 3, s));
    shown = fuseFix(shown, fix(1, 3, 120.2));
    expect(northOfA(shown)).toBeGreaterThanOrEqual(0.5);
  });

  it('BR12 GPS speed noise of a phone lying still never makes the ball drift', () => {
    let shown = null;
    for (let s = 0; s <= 10; s += 1) {
      shown = fuseFix(shown, { ...fix(0, 5, s), speed: 0.3, heading: (s * 97) % 360 });
    }
    expect(shown.velocity).toEqual([0, 0]);
    expect(Math.abs(northOfA(shown))).toBeLessThan(0.1);
  });

  it('BR12 the walking direction is known after about 4 m', () => {
    const start = reading(...A);
    const { anchor } = headingFrom(start, null);
    const step = reading(A[0] + 4.2 / 111_320, A[1]);
    expect(headingFrom(step, anchor).heading).toBeCloseTo(0, 0);
  });
});
