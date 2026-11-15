// Day or night on the campus from the sun over Heilbronn (the aerial photo's night look follows it).
import { describe, expect, it } from 'vitest';
import { isNight, sunElevation } from '../src/daylight.js';

const at = (iso) => new Date(iso);

describe('day and night on the campus', () => {
  it('puts the sun as high as it really stands over Heilbronn at noon in summer and winter', () => {
    // At true noon: 90 - 49.15 + 23.44 = 64.3 degrees at midsummer, 90 - 49.15 - 23.44 = 17.4 at midwinter.
    expect(sunElevation(at('2026-06-21T13:23:00+02:00'))).toBeCloseTo(64.3, 0);
    expect(sunElevation(at('2026-12-21T12:22:00+01:00'))).toBeCloseTo(17.4, 0);
  });

  it('follows German time with summer time: sunrise and sunset in June and December', () => {
    // Heilbronn: about 05:22 and 21:33 (CEST) at midsummer, 08:13 and 16:29 (CET) at midwinter.
    expect(isNight(at('2026-06-21T05:00:00+02:00'))).toBe(true);
    expect(isNight(at('2026-06-21T05:45:00+02:00'))).toBe(false);
    expect(isNight(at('2026-06-21T21:15:00+02:00'))).toBe(false);
    expect(isNight(at('2026-06-21T21:50:00+02:00'))).toBe(true);
    expect(isNight(at('2026-12-21T07:55:00+01:00'))).toBe(true);
    expect(isNight(at('2026-12-21T08:35:00+01:00'))).toBe(false);
    expect(isNight(at('2026-12-21T16:10:00+01:00'))).toBe(false);
    expect(isNight(at('2026-12-21T16:50:00+01:00'))).toBe(true);
  });

  it('is night at midnight and day at noon every month', () => {
    for (let month = 1; month <= 12; month += 1) {
      const mm = String(month).padStart(2, '0');
      expect(isNight(at(`2026-${mm}-15T00:00:00Z`)), mm).toBe(true);
      expect(isNight(at(`2026-${mm}-15T11:30:00Z`)), mm).toBe(false);
    }
  });
});
