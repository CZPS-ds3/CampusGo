// Reads the location of a quest from a Google Maps link the admin pasted (BR51).
// The admin always gets the reason when a link cannot be used. Short links are opened on the server, but only on
// Google hosts over https and with a limited number of redirects, so the box cannot be used to reach other servers.
import { AppError } from '../middleware/errors.js';
import { MAP_AREA, insideMapArea } from '../map-area.js';

const MAX_LENGTH = 2000;
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 5000;

const GOOGLE_HOST = /^(www\.|maps\.)?google\.(com|de|co\.uk|fr|es|it|nl|at|ch|pl|be|se|dk)$/;
const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);
const CONSENT_HOST = 'consent.google.com';
const NUMBER = '-?\\d{1,3}(?:\\.\\d+)?';
const PAIR = new RegExp(`^(${NUMBER})\\s*,\\s*(${NUMBER})$`);
const PIN = new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`);
const VIEWPORT = new RegExp(`@(${NUMBER}),(${NUMBER})`);
const QUERY_KEYS = ['q', 'query', 'll', 'center', 'destination', 'daddr'];

/** An error the admin can read: `code` says what is wrong, `message` explains how to fix it. */
export const linkError = (code, message, details = {}) =>
  new AppError(400, 'INVALID_MAP_LINK', message, { reason: code, ...details });

const isShortHost = (url) =>
  SHORT_HOSTS.has(url.hostname) && (url.hostname !== 'goo.gl' || url.pathname.startsWith('/maps'));

function parseUrl(text) {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function coordinates(lat, lng) {
  const result = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng)) return null;
  return result;
}

/** The pin position of a Google Maps link: the place pin first, then the map centre, then a "lat,lng" query. */
function coordinatesIn(url) {
  const whole = safeDecode(url.pathname + url.search + url.hash);
  const pin = PIN.exec(whole);
  if (pin) return coordinates(pin[1], pin[2]);
  for (const key of QUERY_KEYS) {
    const pair = PAIR.exec((url.searchParams.get(key) ?? '').trim());
    if (pair) return coordinates(pair[1], pair[2]);
  }
  const placePair = PAIR.exec(safeDecode(url.pathname.split('/').pop() ?? ''));
  if (placePair) return coordinates(placePair[1], placePair[2]);
  const view = VIEWPORT.exec(whole);
  return view ? coordinates(view[1], view[2]) : null;
}

/** One redirect step of a short link. Only the Location header is read; the body is never fetched. */
async function followOnce(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url.href, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (campus-city-quest map-link check)' },
    });
    return response.headers.get('location');
  } finally {
    clearTimeout(timer);
  }
}

async function resolveShortLink(start, fetchImpl) {
  let url = start;
  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    let location;
    try {
      location = await followOnce(url, fetchImpl);
    } catch {
      throw linkError(
        'SHORT_LINK_FAILED',
        'The short link could not be opened (no connection, or it took too long). Open it in your browser, copy the long address from the address bar and paste that instead.',
      );
    }
    if (!location) {
      throw linkError(
        'SHORT_LINK_FAILED',
        'The short link did not lead to a map. Open it in your browser, copy the long address from the address bar and paste that instead.',
      );
    }
    const next = parseUrl(location.startsWith('/') ? new URL(location, url).href : location);
    if (next?.protocol !== 'https:' || !(GOOGLE_HOST.test(next.hostname) || isShortHost(next))) {
      throw linkError(
        'NOT_GOOGLE_MAPS',
        'The short link leads somewhere that is not Google Maps, so it was not opened.',
      );
    }
    if (next.hostname === CONSENT_HOST) {
      const target = parseUrl(next.searchParams.get('continue') ?? '');
      if (target) return target;
    }
    if (!isShortHost(next)) return next;
    url = next;
  }
  throw linkError(
    'SHORT_LINK_FAILED',
    'The short link forwards too many times. Open it in your browser, copy the long address and paste that instead.',
  );
}

/**
 * Turns a pasted Google Maps link into a position inside the map area.
 * Throws an INVALID_MAP_LINK error whose `reason` and `message` tell the admin what is wrong.
 * @param {string} input what was pasted into the box
 * @param {{ fetchImpl?: typeof fetch }} [options] `fetchImpl` lets tests replace the network
 * @returns {Promise<{ lat: number, lng: number, url: string }>}
 */
export async function readMapLink(input, { fetchImpl = globalThis.fetch } = {}) {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text) {
    throw linkError('EMPTY', 'Paste a Google Maps link into the box.');
  }
  if (text.length > MAX_LENGTH) {
    throw linkError('TOO_LONG', 'That text is too long to be a map link.');
  }
  let url = parseUrl(text);
  if (!url || !/^[a-z][a-z0-9+.-]*:$/.test(url.protocol)) {
    throw linkError(
      'NOT_A_LINK',
      'That is not a web address. Copy the address of the place from Google Maps, it starts with https://',
    );
  }
  if (url.protocol !== 'https:') {
    throw linkError('NOT_HTTPS', 'The link must start with https://');
  }
  const google = GOOGLE_HOST.test(url.hostname);
  if (!google && !isShortHost(url)) {
    throw linkError(
      'NOT_GOOGLE_MAPS',
      'Only Google Maps links are accepted (google.com/maps or maps.app.goo.gl).',
    );
  }
  if (google && !url.pathname.startsWith('/maps') && url.hostname !== CONSENT_HOST) {
    throw linkError(
      'NOT_GOOGLE_MAPS',
      'That Google link is not a map link. Open the place in Google Maps and copy its address.',
    );
  }
  if (isShortHost(url)) url = await resolveShortLink(url, fetchImpl);

  const position = coordinatesIn(url);
  if (!position) {
    throw linkError(
      'NO_COORDINATES',
      'The link has no exact position. In Google Maps, search for the place or tap the spot on the map, then copy the address from the address bar (or use Share, Copy link).',
    );
  }
  if (Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180) {
    throw linkError('BAD_COORDINATES', 'The position in the link is not a real place on Earth.');
  }
  if (!insideMapArea(position.lat, position.lng)) {
    throw linkError(
      'OUTSIDE_MAP_AREA',
      `The place is outside the map students can see (latitude ${MAP_AREA.south} to ${MAP_AREA.north}, longitude ${MAP_AREA.west} to ${MAP_AREA.east}). Choose a place inside the Heilbronn campus area.`,
      { area: { ...MAP_AREA } },
    );
  }
  return {
    lat: Math.round(position.lat * 1e6) / 1e6,
    lng: Math.round(position.lng * 1e6) / 1e6,
    url: url.href.slice(0, 500),
  };
}
