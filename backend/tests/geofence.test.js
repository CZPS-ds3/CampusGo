// Pure geofencing tests (Main Project Document, section 9, test 1 and the Figure 3 order). No database.
// All positions are invented or public map points; never real student locations.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHECKPOINTS } from '../src/db/seed.js';
import { distanceMeters, evaluateLocation, roundedDistance } from '../src/services/geo.js';

const LIMITS = { maxAccuracyM: 50, maxPositionAgeMs: 30_000 };
const CENTRE = { latitude: 49.1, longitude: 9.2, radius: 60 };
const reading = (overrides = {}) => ({ lat: 49.1, lng: 9.2, accuracy: 10, ageMs: 0, ...overrides });

describe('test 1: Haversine distance', () => {
  it('the same point twice is 0 m', () => {
    expect(distanceMeters(49.1, 9.2, 49.1, 9.2)).toBe(0);
  });

  it('0.0005 degrees of latitude is about 55.6 m', () => {
    expect(distanceMeters(49.1, 9.2, 49.1005, 9.2)).toBeCloseTo(55.6, 0);
  });

  it('0.002 degrees of latitude is about 222.4 m', () => {
    expect(Math.abs(distanceMeters(49.1, 9.2, 49.102, 9.2) - 222.4)).toBeLessThan(0.5);
  });

  it('a degree of longitude is shorter than a degree of latitude at Heilbronn', () => {
    expect(distanceMeters(49.1, 9.2, 49.1, 9.201)).toBeLessThan(
      distanceMeters(49.1, 9.2, 49.101, 9.2),
    );
  });

  it('the distance shown to students is rounded to 10 m', () => {
    expect(roundedDistance(222.4)).toBe(220);
    expect(roundedDistance(85)).toBe(90);
  });
});

describe('Figure 3: freshness, then accuracy, then distance', () => {
  it('inside the circle with a fresh, precise reading', () => {
    expect(evaluateLocation(reading(), CENTRE, LIMITS)).toEqual({
      outcome: 'inside',
      distanceM: 0,
    });
  });

  it('exactly on the edge counts as inside; one step further does not', () => {
    const edge = 60 / 111_195; // degrees of latitude for 60 m on the Haversine sphere
    expect(evaluateLocation(reading({ lat: 49.1 + edge * 0.999 }), CENTRE, LIMITS).outcome).toBe(
      'inside',
    );
    expect(evaluateLocation(reading({ lat: 49.1 + edge * 1.01 }), CENTRE, LIMITS).outcome).toBe(
      'outside',
    );
  });

  it('outside the circle reports the rounded distance', () => {
    expect(evaluateLocation(reading({ lat: 49.102 }), CENTRE, LIMITS)).toEqual({
      outcome: 'outside',
      distanceM: 220,
    });
  });

  it('accuracy worse than 50 m is refused even at the centre', () => {
    expect(evaluateLocation(reading({ accuracy: 50 }), CENTRE, LIMITS).outcome).toBe('inside');
    expect(evaluateLocation(reading({ accuracy: 50.1 }), CENTRE, LIMITS)).toEqual({
      outcome: 'poor_accuracy',
    });
  });

  it('a reading older than 30 s or from the future is stale, before accuracy is looked at', () => {
    expect(evaluateLocation(reading({ ageMs: 30_000 }), CENTRE, LIMITS).outcome).toBe('inside');
    expect(evaluateLocation(reading({ ageMs: 30_001, accuracy: 999 }), CENTRE, LIMITS)).toEqual({
      outcome: 'stale',
    });
    expect(evaluateLocation(reading({ ageMs: -1 }), CENTRE, LIMITS).outcome).toBe('stale');
  });

  it('decimal coordinates coming back from MySQL as strings still work', () => {
    const fromDb = { latitude: '49.100000', longitude: '9.200000', radius: 60 };
    expect(evaluateLocation(reading(), fromDb, LIMITS).outcome).toBe('inside');
  });
});

describe('BR07 BR08 seeded checkpoints are on the Bildungscampus Heilbronn', () => {
  const RADIUS = {
    Mensa: 80,
    Library: 80,
    'Building B': 80,
    'Building C': 80,
    'Campus Garden': 70,
  };

  it('has the eight pilot checkpoints with lenient starting radii (60-80 m) and the question counts of section 5', () => {
    expect(CHECKPOINTS.map(([name]) => name).sort()).toEqual(
      [
        'Building B',
        'Building C',
        'CAS Cafe',
        'Campus Garden',
        'Care.box and Shop.box',
        'Sensoricum',
        'Library',
        'Mensa',
      ].sort(),
    );
    for (const [name, , , radius, count, threshold] of CHECKPOINTS) {
      expect(radius).toBe(RADIUS[name] ?? 60);
      expect(count).toBe(RADIUS[name] === 80 ? 5 : 3); // BR09
      expect(threshold).toBe(count === 5 ? 4 : 2); // BR15
    }
  });

  // A typo check like the one in section 5: the old placeholders were about 2.8 km away.
  it('every centre lies within 500 m of DHBW Heilbronn (Bildungscampus 4)', () => {
    for (const [name, latitude, longitude] of CHECKPOINTS) {
      expect(distanceMeters(latitude, longitude, 49.147126, 9.218486), name).toBeLessThan(500);
    }
  });
});

describe('overlapping circles: one spot never unlocks two checkpoints (Building C and Sensoricum)', () => {
  const zones = CHECKPOINTS.filter(([, , , , , , , active]) => active).map(
    ([checkpoint_name, latitude, longitude, radius], i) => ({
      checkpoint_id: i + 1,
      checkpoint_name,
      latitude,
      longitude,
      radius,
    }),
  );
  const byName = (name) => zones.find((z) => z.checkpoint_name === name);
  const verifiedAt = (lat, lng) =>
    zones.filter(
      (z) =>
        evaluateLocation(
          { lat, lng, accuracy: 5, ageMs: 0 },
          z,
          LIMITS,
          zones.filter((o) => o !== z),
        ).outcome === 'inside',
    );
  const here = (zone) => [Number(zone.latitude), Number(zone.longitude)];

  it('the two circles really do overlap, so the rule is needed', () => {
    const c = byName('Building C');
    const s = byName('Sensoricum');
    expect(distanceMeters(...here(c), ...here(s))).toBeLessThan(c.radius + s.radius);
  });

  it('standing in Building C unlocks Building C only, and the Sensoricum says so', () => {
    const c = byName('Building C');
    const s = byName('Sensoricum');
    const reading = { lat: c.latitude, lng: c.longitude, accuracy: 5, ageMs: 0 };
    expect(verifiedAt(c.latitude, c.longitude).map((z) => z.checkpoint_name)).toEqual([
      'Building C',
    ]);
    const refused = evaluateLocation(reading, s, LIMITS, [c]);
    expect(refused.outcome).toBe('elsewhere');
    expect(refused.elsewhere).toBe('Building C');
  });

  it('standing at the Sensoricum unlocks the Sensoricum only, and Building C says so', () => {
    const c = byName('Building C');
    const s = byName('Sensoricum');
    const reading = { lat: s.latitude, lng: s.longitude, accuracy: 5, ageMs: 0 };
    expect(verifiedAt(s.latitude, s.longitude).map((z) => z.checkpoint_name)).toEqual([
      'Sensoricum',
    ]);
    const refused = evaluateLocation(reading, c, LIMITS, [s]);
    expect(refused.outcome).toBe('elsewhere');
    expect(refused.elsewhere).toBe('Sensoricum');
  });

  it('a tie goes to the checkpoint with the lower id', () => {
    const a = {
      checkpoint_id: 1,
      checkpoint_name: 'A',
      latitude: 49.1,
      longitude: 9.2,
      radius: 60,
    };
    const b = { ...a, checkpoint_id: 2, checkpoint_name: 'B' };
    const r = { lat: 49.1, lng: 9.2, accuracy: 5, ageMs: 0 };
    expect(evaluateLocation(r, a, LIMITS, [b]).outcome).toBe('inside');
    expect(evaluateLocation(r, b, LIMITS, [a]).outcome).toBe('elsewhere');
  });

  it('a reading outside a circle is plain "outside", even if another circle contains it', () => {
    const c = byName('Building C');
    const s = byName('Sensoricum');
    const far = { lat: c.latitude - 0.0006, lng: c.longitude, accuracy: 5, ageMs: 0 };
    expect(evaluateLocation(far, s, LIMITS, [c]).outcome).toBe('outside');
  });

  it('a sweep over the whole campus finds no spot that verifies two checkpoints', () => {
    let spotsInsideAny = 0;
    for (let lat = 49.1455; lat <= 49.1505; lat += 0.00003) {
      for (let lng = 9.2125; lng <= 9.2195; lng += 0.00004) {
        const hits = verifiedAt(lat, lng);
        expect(hits.length).toBeLessThanOrEqual(1);
        spotsInsideAny += hits.length;
      }
    }
    expect(spotsInsideAny).toBeGreaterThan(1000); // the sweep really covered the circles
  });
});

describe('testing/ guide: the documented test positions match the seed and behave as written', () => {
  const read = (name) => readFileSync(new URL(`../../testing/${name}`, import.meta.url), 'utf8');
  const file = JSON.parse(read('checkpoint-coordinates.json'));
  const guide = read('location-testing-guide.md');
  const zones = CHECKPOINTS.filter(([, , , , , , , active]) => active).map(
    ([checkpoint_name, latitude, longitude, radius], i) => ({
      checkpoint_id: i + 1,
      checkpoint_name,
      latitude,
      longitude,
      radius,
    }),
  );
  const at = (lat, lng) => ({ lat, lng, accuracy: 10, ageMs: 0 });
  const six = (n) => n.toFixed(6);
  const pair = (p) => `${six(p.lat)}, ${six(p.lng)}`;

  it('lists every active checkpoint with the radius and centre of the seed', () => {
    expect(file.accuracyM).toBe(10);
    expect(file.checkpoints.map((c) => c.name)).toEqual(zones.map((z) => z.checkpoint_name));
    for (const entry of file.checkpoints) {
      const zone = zones.find((z) => z.checkpoint_name === entry.name);
      expect(entry.radiusM, entry.name).toBe(zone.radius);
      expect(entry.centre, entry.name).toEqual({ lat: zone.latitude, lng: zone.longitude });
    }
  });

  it('centre and inside positions unlock their checkpoint, outside positions do not', () => {
    for (const entry of file.checkpoints) {
      const zone = zones.find((z) => z.checkpoint_name === entry.name);
      const others = zones.filter((o) => o !== zone);
      for (const spot of [entry.centre, entry.inside]) {
        const r = evaluateLocation(at(spot.lat, spot.lng), zone, LIMITS, others);
        expect(r.outcome, `${entry.name} ${pair(spot)}`).toBe('inside');
      }
      const out = evaluateLocation(at(entry.outside.lat, entry.outside.lng), zone, LIMITS, others);
      expect(out.outcome, `${entry.name} outside`).toBe('outside');
    }
  });

  it('every documented overlap is refused in favour of the checkpoint you stand at', () => {
    expect(file.overlaps.length).toBeGreaterThanOrEqual(2);
    for (const o of file.overlaps) {
      const zone = zones.find((z) => z.checkpoint_name === o.tap);
      const others = zones.filter((z) => z !== zone);
      const r = evaluateLocation(at(o.lat, o.lng), zone, LIMITS, others);
      expect(r.outcome, `${o.standAt} -> ${o.tap}`).toBe('elsewhere');
      expect(`You are at ${r.elsewhere}, not at ${o.tap}.`).toBe(o.expectedMessage);
      expect(guide, `${o.standAt} -> ${o.tap}`).toContain(o.expectedMessage.slice(0, -1));
    }
  });

  it('the written guide shows the same coordinates as the JSON file', () => {
    for (const entry of file.checkpoints) {
      for (const spot of [entry.centre, entry.inside, entry.outside]) {
        expect(guide, `${entry.name} ${pair(spot)}`).toContain(pair(spot));
      }
    }
  });
});
