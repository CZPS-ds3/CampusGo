import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { distanceMeters, evaluateLocation } from '../src/services/geo.js';

const config = loadConfig({ NODE_ENV: 'test' });
// A building checkpoint with the tight radius of BR12 (2026-11-14).
const CENTRE = { checkpoint_id: 1, latitude: 49.1, longitude: 9.2, radius: 35 };
// About one metre of latitude, so offsets below are easy to read.
const METRE = 1 / 111_195;
const at = (metres, extra = {}) => ({
  lat: 49.1 + metres * METRE,
  lng: 9.2,
  accuracy: 10,
  ageMs: 0,
  ...extra,
});

describe('BR12 geofence grace zone and accuracy credit', () => {
  it('BR12 the defaults are tight: 200 m accuracy, 10 m grace zone, 15 m accuracy credit, 20 m margin', () => {
    expect(config).toMatchObject({
      maxAccuracyM: 200,
      geofenceSlackM: 10,
      accuracyCreditM: 15,
      nearerMarginM: 20,
    });
  });

  it('BR12 a precise reading gets the grace zone: 19 m beyond the radius is inside, 25 m is outside', () => {
    // accuracy 10 gives 10 m of credit, so the edge is 35 + 10 + 10 = 55 m.
    expect(evaluateLocation(at(35 + 5), CENTRE, config).outcome).toBe('inside');
    expect(evaluateLocation(at(35 + 19), CENTRE, config).outcome).toBe('inside');
    expect(evaluateLocation(at(35 + 25), CENTRE, config).outcome).toBe('outside');
  });

  it('BR12 a vaguer reading earns a wider edge, but the credit stops at 15 m', () => {
    // accuracy 15: edge 35 + 10 + 15 = 60 m.
    expect(evaluateLocation(at(58, { accuracy: 15 }), CENTRE, config).outcome).toBe('inside');
    expect(evaluateLocation(at(62, { accuracy: 15 }), CENTRE, config).outcome).toBe('outside');
    // accuracy 200 only earns the capped 15 m, the same 60 m edge: a vague reading cannot unlock from far away.
    expect(evaluateLocation(at(58, { accuracy: 200 }), CENTRE, config).outcome).toBe('inside');
    expect(evaluateLocation(at(62, { accuracy: 200 }), CENTRE, config).outcome).toBe('outside');
  });

  it('BR12 standing at the Mensa never reaches Care.box and Shop.box, 127 m away', () => {
    const shopBox = { ...CENTRE, radius: 25 };
    expect(evaluateLocation(at(127, { accuracy: 200 }), shopBox, config).outcome).toBe('outside');
    // Even at the edge of the Mensa's own circle (35 m nearer), the Shop.box is still 92 m away.
    expect(evaluateLocation(at(92, { accuracy: 15 }), shopBox, config).outcome).toBe('outside');
  });

  it('BR12 an accuracy of 200 m is accepted, 201 m is not', () => {
    expect(evaluateLocation(at(0, { accuracy: 200 }), CENTRE, config).outcome).toBe('inside');
    expect(evaluateLocation(at(0, { accuracy: 201 }), CENTRE, config).outcome).toBe(
      'poor_accuracy',
    );
  });

  it('BR12 another checkpoint wins only when its centre is clearly nearer', () => {
    const other = {
      checkpoint_id: 2,
      checkpoint_name: 'Building C',
      latitude: 49.1 + 70 * METRE,
      longitude: 9.2,
      radius: 35,
    };
    // 40 m from this centre and 30 m from the other: only 10 m nearer, so no "you are elsewhere".
    expect(distanceMeters(49.1, 9.2, 49.1 + 40 * METRE, 9.2)).toBeGreaterThan(39);
    expect(evaluateLocation(at(40), CENTRE, config, [other]).outcome).toBe('inside');
    // 20 m from this centre and 50 m from the other: this one is clearly nearer.
    expect(evaluateLocation(at(20), CENTRE, config, [other]).outcome).toBe('inside');
    // 50 m from this centre, 20 m from the other: the other one is clearly nearer.
    const far = evaluateLocation(at(50), CENTRE, config, [other]);
    expect(far).toMatchObject({ outcome: 'elsewhere', elsewhere: 'Building C' });
  });
});
