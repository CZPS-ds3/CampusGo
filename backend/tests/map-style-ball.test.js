// The live-position ball's colours in the map style (BR48). Pure validation, no database.
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_STYLE, validateMapStyle } from '../src/services/map-style.js';

describe('BR48 the colours of the live-position ball', () => {
  it('BR48 the default ball is white with red lines, as before', () => {
    expect(DEFAULT_MAP_STYLE.ball).toEqual({ body: '#ffffff', lines: '#e2001a' });
    expect(validateMapStyle({}).ball).toEqual({ body: '#ffffff', lines: '#e2001a' });
  });

  it('BR48 a ball colour is stored as #rrggbb, and a missing one keeps the default', () => {
    const style = validateMapStyle({ ball: { body: 'rgb(0, 92, 173)' } });
    expect(style.ball).toEqual({ body: '#005cad', lines: '#e2001a' });
    expect(validateMapStyle({ ball: { lines: '#0F0' } }).ball.lines).toBe('#00ff00');
  });

  it('BR48 a ball colour that is not a colour is refused, naming the setting', () => {
    expect(() => validateMapStyle({ ball: { body: 'url(x)' } })).toThrow(
      /ball\.body is not a colour/,
    );
    expect(() => validateMapStyle({ ball: { lines: 'red;}' } })).toThrow(/ball\.lines/);
  });

  it('BR48 unknown ball settings and a ball that is not an object are refused', () => {
    expect(() => validateMapStyle({ ball: { glow: '#ffffff' } })).toThrow(
      /ball\.glow is not a known/,
    );
    expect(() => validateMapStyle({ ball: '#ffffff' })).toThrow(/ball must be an object/);
  });
});
