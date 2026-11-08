import { describe, expect, it } from 'vitest';
import {
  drawableRadius,
  formatMetres,
  overlappingQuests,
  radiusProblem,
} from '../src/pages/admin/geofence.js';

describe('BR12 BR49 radius editor numbers', () => {
  it('BR49 the circle is drawn for any valid number and clamped for an out-of-range one', () => {
    expect(drawableRadius('80')).toBe(80);
    expect(drawableRadius('80.4')).toBe(80);
    expect(drawableRadius('5')).toBe(10);
    expect(drawableRadius('900')).toBe(500);
    expect(drawableRadius('')).toBeNaN();
    expect(drawableRadius('abc')).toBeNaN();
  });

  it('BR49 only a whole number from 10 to 500 passes, like the server', () => {
    expect(radiusProblem('10')).toBeNull();
    expect(radiusProblem('500')).toBeNull();
    expect(radiusProblem('9')).toBe('range');
    expect(radiusProblem('501')).toBe('range');
    expect(radiusProblem('80.5')).toBe('format');
    expect(radiusProblem('')).toBe('format');
    expect(radiusProblem('abc')).toBe('format');
  });

  it('distances read as metres, and as kilometres from 1000 m', () => {
    expect(formatMetres(160)).toBe('160 m');
    expect(formatMetres(159.6)).toBe('160 m');
    expect(formatMetres(1000)).toBe('1.0 km');
  });

  it('BR12 circles that touch are found, far ones are not', () => {
    const centre = { lat: 49.147316, lng: 9.2179 };
    const sensoricum = { id: 8, name: 'Sensoricum', lat: 49.14762, lng: 9.217807, radius: 60 };
    const garden = { id: 4, name: 'Campus Garden', lat: 49.147082, lng: 9.217206, radius: 40 };
    const faraway = { id: 9, name: 'Faraway', lat: 49.16, lng: 9.23, radius: 80 };
    const names = (radius) =>
      overlappingQuests(centre, radius, [sensoricum, garden, faraway]).map((q) => q.name);
    expect(names(80)).toEqual(['Sensoricum', 'Campus Garden']);
    expect(names(10)).toEqual(['Sensoricum']);
    expect(overlappingQuests(null, 80, [sensoricum])).toEqual([]);
    expect(overlappingQuests(centre, Number.NaN, [sensoricum])).toEqual([]);
  });
});
