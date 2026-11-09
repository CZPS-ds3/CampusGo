import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { distanceMeters, evaluateLocation } from '../src/services/geo.js';

const config = loadConfig({ NODE_ENV: 'test' });
const CENTRE = { checkpoint_id: 1, latitude: 49.1, longitude: 9.2, radius: 60 };
// About one metre of latitude, so offsets below are easy to read.
const METRE = 1 / 111_195;
const at = (metres, extra = {}) => ({
  lat: 49.1 + metres * METRE,
  lng: 9.2,
  accuracy: 10,
  ageMs: 0,
  ...extra,
});

describe('BR12 lenient geofence', () => {
  it('BR12 the defaults are lenient: 200 m accuracy, 30 m grace zone, 50 m accuracy credit, 20 m margin', () => {
    expect(config).toMatchObject({
      maxAccuracyM: 200,
      geofenceSlackM: 30,
      accuracyCreditM: 50,
      nearerMarginM: 20,
    });
  });

  it('BR12 a precise reading gets the grace zone: 30 m beyond the radius is inside, 45 m is outside', () => {
    // accuracy 10 gives 10 m of credit, so the edge is 60 + 30 + 10 = 100 m.
    expect(evaluateLocation(at(60 + 20), CENTRE, config).outcome).toBe('inside');
    expect(evaluateLocation(at(60 + 39), CENTRE, config).outcome).toBe('inside');
    expect(evaluateLocation(at(60 + 45), CENTRE, config).outcome).toBe('outside');
  });

  it('BR12 a vaguer reading earns a wider edge, but the credit stops at 50 m', () => {
    // accuracy 40: edge 60 + 30 + 40 = 130 m.
    expect(evaluateLocation(at(125, { accuracy: 40 }), CENTRE, config).outcome).toBe('inside');
    expect(evaluateLocation(at(135, { accuracy: 40 }), CENTRE, config).outcome).toBe('outside');
    // accuracy 200 only earns the capped 50 m: edge 60 + 30 + 50 = 140 m.
    expect(evaluateLocation(at(135, { accuracy: 200 }), CENTRE, config).outcome).toBe('inside');
    expect(evaluateLocation(at(145, { accuracy: 200 }), CENTRE, config).outcome).toBe('outside');
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
      radius: 60,
    };
    // 40 m from this centre and 30 m from the other: only 10 m nearer, so no "you are elsewhere".
    expect(distanceMeters(49.1, 9.2, 49.1 + 40 * METRE, 9.2)).toBeGreaterThan(39);
    expect(evaluateLocation(at(40), CENTRE, config, [other]).outcome).toBe('inside');
    // 20 m from this centre and 50 m from the other: this one is clearly nearer.
    expect(evaluateLocation(at(20), CENTRE, config, [other]).outcome).toBe('inside');
    // 60 m from this centre, 10 m from the other: the other one is clearly nearer.
    const far = evaluateLocation(at(60), CENTRE, config, [other]);
    expect(far).toMatchObject({ outcome: 'elsewhere', elsewhere: 'Building C' });
  });
});
