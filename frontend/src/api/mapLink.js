// Small copy of the server's Google Maps link reader (backend/src/services/map-link.js) for the in-browser mock.
// Same reasons and the same map area; short links cannot be opened from the browser.

/** The area of the student map (also in MapView.jsx and backend/src/map-area.js; a test keeps them equal). */
export const MAP_AREA = { south: 49.12, west: 9.17, north: 49.18, east: 9.26 };

const GOOGLE_HOST = /^(www\.|maps\.)?google\.(com|de|co\.uk|fr|es|it|nl|at|ch|pl|be|se|dk)$/;
const NUMBER = '-?\\d{1,3}(?:\\.\\d+)?';
const PAIR = new RegExp(`^(${NUMBER})\\s*,\\s*(${NUMBER})$`);
const PIN = new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`);
const VIEWPORT = new RegExp(`@(${NUMBER}),(${NUMBER})`);
const QUERY_KEYS = ['q', 'query', 'll', 'center', 'destination', 'daddr'];

const fail = (reason, message, details = {}) => ({ ok: false, reason, message, ...details });

const decode = (text) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

function coordinatesIn(url) {
  const whole = decode(url.pathname + url.search + url.hash);
  const pin = PIN.exec(whole);
  if (pin) return [Number(pin[1]), Number(pin[2])];
  for (const key of QUERY_KEYS) {
    const pair = PAIR.exec((url.searchParams.get(key) ?? '').trim());
    if (pair) return [Number(pair[1]), Number(pair[2])];
  }
  const place = PAIR.exec(decode(url.pathname.split('/').pop() ?? ''));
  if (place) return [Number(place[1]), Number(place[2])];
  const view = VIEWPORT.exec(whole);
  return view ? [Number(view[1]), Number(view[2])] : null;
}

/** { ok: true, lat, lng, url } or { ok: false, reason, message }. */
export function parseMapLink(input) {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text) return fail('EMPTY', 'Paste a Google Maps link into the box.');
  if (text.length > 2000) return fail('TOO_LONG', 'That text is too long to be a map link.');
  let url;
  try {
    url = new URL(text);
  } catch {
    return fail(
      'NOT_A_LINK',
      'That is not a web address. Copy the address of the place from Google Maps, it starts with https://',
    );
  }
  if (url.protocol !== 'https:') return fail('NOT_HTTPS', 'The link must start with https://');
  const short = url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl';
  if (!GOOGLE_HOST.test(url.hostname) && !short) {
    return fail(
      'NOT_GOOGLE_MAPS',
      'Only Google Maps links are accepted (google.com/maps or maps.app.goo.gl).',
    );
  }
  if (short) {
    return fail(
      'SHORT_LINK_FAILED',
      'Short links can only be opened by the real server. Open it in your browser, copy the long address and paste that instead.',
    );
  }
  if (!url.pathname.startsWith('/maps')) {
    return fail(
      'NOT_GOOGLE_MAPS',
      'That Google link is not a map link. Open the place in Google Maps and copy its address.',
    );
  }
  const position = coordinatesIn(url);
  if (!position) {
    return fail(
      'NO_COORDINATES',
      'The link has no exact position. In Google Maps, search for the place or tap the spot on the map, then copy the address from the address bar (or use Share, Copy link).',
    );
  }
  const [lat, lng] = position;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return fail('BAD_COORDINATES', 'The position in the link is not a real place on Earth.');
  }
  const { south, west, north, east } = MAP_AREA;
  if (lat < south || lat > north || lng < west || lng > east) {
    return fail(
      'OUTSIDE_MAP_AREA',
      `The place is outside the map students can see (latitude ${south} to ${north}, longitude ${west} to ${east}). Choose a place inside the Heilbronn campus area.`,
      { area: { ...MAP_AREA } },
    );
  }
  return {
    ok: true,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    url: url.href.slice(0, 500),
  };
}
