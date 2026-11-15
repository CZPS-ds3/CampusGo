// The sonar range ring settings in the map style (BR48). Pure validation, no database.
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_STYLE, validateMapStyle } from '../src/services/map-style.js';

describe('BR48 the sonar range ring settings', () => {
  it('BR48 the sonar is on by default, red, normal speed, soft-pulse look, with the flash on', () => {
    const sonar = { show: true, color: '#e2001a', speed: 'normal', look: 'soft', ping: true };
    expect(DEFAULT_MAP_STYLE.sonar).toEqual(sonar);
    expect(validateMapStyle({}).sonar).toEqual(sonar);
  });

  it('BR48 a style saved before the sonar existed gets the default sonar', () => {
    const old = { ...DEFAULT_MAP_STYLE };
    delete old.sonar;
    expect(validateMapStyle(old).sonar).toEqual(DEFAULT_MAP_STYLE.sonar);
  });

  it('BR48 every sonar setting can be changed, and the colour is stored as #rrggbb', () => {
    const style = validateMapStyle({
      sonar: { show: false, color: 'rgb(0, 92, 173)', speed: 'fast', look: 'sova', ping: false },
    });
    expect(style.sonar).toEqual({
      show: false,
      color: '#005cad',
      speed: 'fast',
      look: 'sova',
      ping: false,
    });
    expect(validateMapStyle({ sonar: { speed: 'slow' } }).sonar.look).toBe('soft');
  });

  it('BR48 wrong sonar settings are refused, naming each one', () => {
    expect(() => validateMapStyle({ sonar: { show: 'yes' } })).toThrow(/sonar\.show must be true/);
    expect(() => validateMapStyle({ sonar: { ping: 1 } })).toThrow(/sonar\.ping/);
    expect(() => validateMapStyle({ sonar: { speed: 'warp' } })).toThrow(
      /sonar\.speed must be one of slow, normal, fast/,
    );
    expect(() => validateMapStyle({ sonar: { look: 'laser' } })).toThrow(/sonar\.look/);
    expect(() => validateMapStyle({ sonar: { color: 'url(x)' } })).toThrow(
      /sonar\.color is not a colour/,
    );
    expect(() => validateMapStyle({ sonar: { size: 3 } })).toThrow(/sonar\.size is not a known/);
    expect(() => validateMapStyle({ sonar: true })).toThrow(/sonar must be an object/);
  });
});
