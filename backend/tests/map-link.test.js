import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { MAP_AREA } from '../src/map-area.js';
import { readMapLink } from '../src/services/map-link.js';

const PLACE =
  'https://www.google.com/maps/place/Mensa/@49.148000,9.215000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d49.148464!4d9.215808';

const redirectTo = (location) => vi.fn(async () => ({ headers: { get: () => location } }));
const reasonOf = async (input, options) => {
  try {
    await readMapLink(input, options);
  } catch (error) {
    expect(error.status).toBe(400);
    expect(error.code).toBe('INVALID_MAP_LINK');
    expect(error.message.length).toBeGreaterThan(15);
    return error.details.reason;
  }
  return 'ACCEPTED';
};

describe('BR51 a pasted Google Maps link becomes a position', () => {
  it('BR51 the pin of a place link wins over the map centre', async () => {
    expect(await readMapLink(PLACE)).toMatchObject({ lat: 49.148464, lng: 9.215808 });
  });

  it('BR51 reads the centre of the map, a "lat,lng" query and a coordinate place', async () => {
    const centre = 'https://www.google.com/maps/@49.1471,9.2182,18z';
    expect(await readMapLink(centre)).toMatchObject({ lat: 49.1471, lng: 9.2182 });
    const query = 'https://www.google.com/maps?q=49.1490,9.2170';
    expect(await readMapLink(query)).toMatchObject({ lat: 49.149, lng: 9.217 });
    const coordinatePlace = 'https://www.google.com/maps/place/49.1475,9.2179';
    expect(await readMapLink(coordinatePlace)).toMatchObject({ lat: 49.1475, lng: 9.2179 });
    expect(await readMapLink(`  ${query}  `)).toMatchObject({ lat: 49.149 });
  });

  it('BR51 opens a short link on a Google host and reads the position it leads to', async () => {
    const fetchImpl = redirectTo(PLACE);
    const place = await readMapLink('https://maps.app.goo.gl/AbCdEf123', { fetchImpl });
    expect(place).toMatchObject({ lat: 49.148464, lng: 9.215808 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('BR51 follows a short link that forwards once more, but not forever', async () => {
    const hops = ['https://goo.gl/maps/second', PLACE];
    const fetchImpl = vi.fn(async () => ({ headers: { get: () => hops.shift() } }));
    expect(await readMapLink('https://maps.app.goo.gl/first', { fetchImpl })).toMatchObject({
      lat: 49.148464,
    });
    const endless = redirectTo('https://maps.app.goo.gl/again');
    expect(await reasonOf('https://maps.app.goo.gl/loop', { fetchImpl: endless })).toBe(
      'SHORT_LINK_FAILED',
    );
    expect(endless).toHaveBeenCalledTimes(5);
  });

  it('BR51 a short link that leads away from Google is not followed (no server-side request forgery)', async () => {
    for (const target of [
      'https://evil.example/maps',
      'http://www.google.com/maps/@49.1,9.2,17z',
      'https://google.com.evil.example/maps/@49.1,9.2,17z',
      'https://169.254.169.254/latest/meta-data',
    ]) {
      const fetchImpl = vi.fn(redirectTo(target));
      expect(await reasonOf('https://maps.app.goo.gl/x', { fetchImpl })).toBe('NOT_GOOGLE_MAPS');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('BR51 says why a short link could not be opened', async () => {
    const down = vi.fn(async () => {
      throw new Error('network down');
    });
    expect(await reasonOf('https://maps.app.goo.gl/x', { fetchImpl: down })).toBe(
      'SHORT_LINK_FAILED',
    );
    expect(await reasonOf('https://maps.app.goo.gl/x', { fetchImpl: redirectTo(null) })).toBe(
      'SHORT_LINK_FAILED',
    );
  });

  it('BR51 tells the admin the reason for every kind of invalid link', async () => {
    expect(await reasonOf('')).toBe('EMPTY');
    expect(await reasonOf('   ')).toBe('EMPTY');
    expect(await reasonOf(undefined)).toBe('EMPTY');
    expect(await reasonOf('x'.repeat(2001))).toBe('TOO_LONG');
    expect(await reasonOf('Mensa Heilbronn')).toBe('NOT_A_LINK');
    expect(await reasonOf('http://www.google.com/maps/@49.14,9.21,17z')).toBe('NOT_HTTPS');
    expect(await reasonOf('https://www.openstreetmap.org/#map=18/49.14/9.21')).toBe(
      'NOT_GOOGLE_MAPS',
    );
    expect(await reasonOf('https://google.com.evil.example/maps/@49.14,9.21,17z')).toBe(
      'NOT_GOOGLE_MAPS',
    );
    expect(await reasonOf('https://www.google.com/search?q=mensa')).toBe('NOT_GOOGLE_MAPS');
    expect(await reasonOf('https://www.google.com/maps/place/Mensa+Heilbronn')).toBe(
      'NO_COORDINATES',
    );
    expect(await reasonOf('https://www.google.com/maps/@95.1,9.2,17z')).toBe('BAD_COORDINATES');
  });

  it('BR51 refuses a place outside the map students can see, and names the area', async () => {
    const berlin = 'https://www.google.com/maps/place/Berlin/@52.52,13.405,12z';
    try {
      await readMapLink(berlin);
      expect.unreachable();
    } catch (error) {
      expect(error.details.reason).toBe('OUTSIDE_MAP_AREA');
      expect(error.details.area).toEqual(MAP_AREA);
      expect(error.message).toContain('49.12');
    }
    expect(await reasonOf('https://www.google.com/maps/@49.1799,9.2601,17z')).toBe(
      'OUTSIDE_MAP_AREA',
    );
    expect(await reasonOf('https://www.google.com/maps/@49.18,9.26,17z')).toBe('ACCEPTED');
  });

  it('BR51 the map area equals the area of the student map', () => {
    const source = readFileSync(
      new URL('../../frontend/src/components/MapView.jsx', import.meta.url),
      'utf8',
    );
    const match = source.match(/L\.latLngBounds\(\[([\d.]+), ([\d.]+)\], \[([\d.]+), ([\d.]+)\]\)/);
    expect(match.slice(1).map(Number)).toEqual([
      MAP_AREA.south,
      MAP_AREA.west,
      MAP_AREA.north,
      MAP_AREA.east,
    ]);
  });
});
