import { describe, expect, it } from 'vitest';
import { MAP_AREA as BACKEND_AREA } from '../../backend/src/map-area.js';
import { MAP_AREA, parseMapLink } from '../src/api/mapLink.js';

const PLACE =
  'https://www.google.com/maps/place/Mensa/@49.148000,9.215000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d49.148464!4d9.215808';

describe('BR51 the in-browser mock reads Google Maps links like the server', () => {
  it('BR51 the map area is the same as on the server', () => {
    expect(MAP_AREA).toEqual(BACKEND_AREA);
  });

  it('BR51 reads the pin before the map centre', () => {
    expect(parseMapLink(PLACE)).toMatchObject({ ok: true, lat: 49.148464, lng: 9.215808 });
    expect(parseMapLink('https://www.google.com/maps/@49.1471,9.2182,18z')).toMatchObject({
      lat: 49.1471,
    });
    expect(parseMapLink('https://www.google.com/maps?q=49.149,9.217')).toMatchObject({
      lng: 9.217,
    });
  });

  it('BR51 gives a reason for every link that cannot be used', () => {
    const reason = (text) => parseMapLink(text).reason;
    expect(reason('')).toBe('EMPTY');
    expect(reason('hello')).toBe('NOT_A_LINK');
    expect(reason('http://www.google.com/maps/@49.14,9.21,17z')).toBe('NOT_HTTPS');
    expect(reason('https://example.org/maps/@49.14,9.21,17z')).toBe('NOT_GOOGLE_MAPS');
    expect(reason('https://google.com.evil.example/maps/@49.14,9.21,17z')).toBe('NOT_GOOGLE_MAPS');
    expect(reason('https://www.google.com/maps/place/Mensa')).toBe('NO_COORDINATES');
    expect(reason('https://www.google.com/maps/@95,9.2,17z')).toBe('BAD_COORDINATES');
    expect(reason('https://www.google.com/maps/@52.52,13.4,12z')).toBe('OUTSIDE_MAP_AREA');
    expect(reason('https://maps.app.goo.gl/abc')).toBe('SHORT_LINK_FAILED');
    expect(parseMapLink('https://www.google.com/maps/@52.52,13.4,12z').message).toContain('49.12');
  });
});
