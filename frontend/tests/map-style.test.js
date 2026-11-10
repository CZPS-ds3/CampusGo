import { beforeEach, describe, expect, it } from 'vitest';
import { contrastRatio, normalizeColor, parseColor, readableOn, toHex } from '../src/colors.js';
import { DEFAULT_MAP_STYLE, PRESETS, cleanStyle, styleVariables } from '../src/mapStyle.js';

describe('BR48 colours a student can type', () => {
  it('BR48 reads #rgb, #rrggbb and rgb(r, g, b) and writes #rrggbb', () => {
    expect(parseColor('#1a2b3c')).toEqual({ r: 26, g: 43, b: 60 });
    expect(parseColor('#abc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseColor(' rgb(26, 43,60) ')).toEqual({ r: 26, g: 43, b: 60 });
    expect(normalizeColor('RGB(255,0,0)')).toBe('#ff0000');
    expect(toHex({ r: 1, g: 2, b: 3 })).toBe('#010203');
  });

  it('BR48 refuses everything else, including a channel above 255', () => {
    for (const bad of ['', 'red', '#12', '#12345', 'rgb(256, 0, 0)', 'rgb(1, 2)', null, 42]) {
      expect(parseColor(bad)).toBeNull();
      expect(normalizeColor(bad)).toBeNull();
    }
  });

  it('BR48 picks white or near-black text, whichever is easier to read', () => {
    expect(readableOn('#000000')).toBe('#ffffff');
    expect(readableOn('#ffff00')).toBe('#14181c');
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe('BR48 the map style of a student', () => {
  beforeEach(() => document.documentElement.removeAttribute('style'));

  it('BR48 the default is light mode and follows the app, so the theme colours stay', () => {
    expect(DEFAULT_MAP_STYLE.base).toBe('follow');
    const variables = styleVariables(DEFAULT_MAP_STYLE);
    expect(Object.values(variables).every((value) => value === undefined)).toBe(true);
  });

  it('BR48 only colours that differ from the default are written as CSS variables', () => {
    const variables = styleVariables(PRESETS.ocean);
    expect(variables['--pin-open']).toBe('#0b5cad');
    expect(variables['--pin-open-fg']).toBe('#ffffff');
    expect(variables['--map-tint-ground']).toBe('#9ad0f5');
    expect(variables['--map-tint-opacity']).toBe('0.7');
    expect(styleVariables(PRESETS.ocean, { keepDefaults: true })['--route']).toBeDefined();
  });

  it('BR48 cleans a broken style back to safe values', () => {
    const style = cleanStyle({
      base: 'sepia',
      pins: { open: 'rgb(0, 0, 300)', done: '#0a0' },
      tint: { color: 'nope', strength: 500 },
      highlight: 5,
    });
    expect(style.base).toBe('follow');
    expect(style.pins.open).toBe(DEFAULT_MAP_STYLE.pins.open);
    expect(style.pins.done).toBe('#00aa00');
    expect(style.tint).toEqual(DEFAULT_MAP_STYLE.tint);
    expect(style.highlight).toBe(DEFAULT_MAP_STYLE.highlight);
    expect(cleanStyle(null)).toEqual(DEFAULT_MAP_STYLE);
  });

  it('BR48 the 3D buildings have their own colour; a broken one falls back to the default', () => {
    expect(cleanStyle({ buildings: 'rgb(18, 52, 86)' }).buildings).toBe('#123456');
    expect(cleanStyle({ buildings: 'url(x)' }).buildings).toBe(DEFAULT_MAP_STYLE.buildings);
    expect(styleVariables({ ...DEFAULT_MAP_STYLE, buildings: '#123456' })['--buildings']).toBe(
      '#123456',
    );
    for (const preset of Object.values(PRESETS)) expect(preset.buildings).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('BR48 every preset is a complete, valid style', () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      expect(cleanStyle(preset), name).toEqual(preset);
    }
  });
});
