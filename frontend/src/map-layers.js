import L from 'leaflet';
import { getMapBase, t } from './i18n.js';

const STREET_URL =
  import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const STREET_ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; OpenStreetMap contributors';

// Open aerial photos of Baden-Wuerttemberg (LGL DOP20, flown in 2026), which already show the current campus,
// including the Sensoricum; the street map still has the old car park there. Licence dl-de/by-2-0, no key needed.
const AERIAL_URL =
  import.meta.env.VITE_MAP_AERIAL_URL ||
  'https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C';
const AERIAL_LAYER = import.meta.env.VITE_MAP_AERIAL_LAYER || 'IMAGES_DOP_20_RGB';
const AERIAL_ATTRIBUTION =
  'Datenquelle: <a href="https://www.lgl-bw.de">LGL</a>, ' +
  '<a href="https://www.govdata.de/dl-de/by-2-0">dl-de/by-2-0</a>';

// The previews in the preferences show the middle of the Bildungscampus.
const PREVIEW_CENTRE = { lat: 49.1476, lng: 9.2172 };
const PREVIEW_ZOOM = 17;
const EARTH_RADIUS_M = 6378137;

/**
 * Adds the aerial photo and the street map to a Leaflet map, with a switch between them, and starts with the type
 * chosen in the preferences. Only the street tiles get the `map-tiles--street` class, so the dark theme's CSS filter
 * and the street-map style never turn the photo into a negative.
 */
export function addBaseLayers(map, { minZoom, position = 'topright' }) {
  const aerial = L.tileLayer.wms(AERIAL_URL, {
    layers: AERIAL_LAYER,
    format: 'image/jpeg',
    version: '1.3.0',
    attribution: AERIAL_ATTRIBUTION,
    minZoom,
    maxZoom: 19,
    crossOrigin: true,
  });
  const street = L.tileLayer(STREET_URL, {
    attribution: STREET_ATTRIBUTION,
    minZoom,
    maxZoom: 19,
    subdomains: 'abcd',
    crossOrigin: true,
    className: 'map-tiles--street',
  });
  (getMapBase() === 'street' ? street : aerial).addTo(map);
  L.control
    .layers({ [t('Aerial photo')]: aerial, [t('Street map')]: street }, undefined, { position })
    .addTo(map);
}

/** Web Mercator metres for a position (the map projection both layers use). */
function mercator({ lat, lng }) {
  return {
    x: (lng * Math.PI * EARTH_RADIUS_M) / 180,
    y: EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
  };
}

/** Image addresses for the small previews of both map types: one street tile and a matching aerial picture. */
export function previewImages() {
  const tiles = 2 ** PREVIEW_ZOOM;
  const x = Math.floor(((PREVIEW_CENTRE.lng + 180) / 360) * tiles);
  const latRad = (PREVIEW_CENTRE.lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * tiles,
  );
  const street = STREET_URL.replace('{s}', 'a')
    .replace('{r}', '')
    .replace('{z}', String(PREVIEW_ZOOM))
    .replace('{x}', String(x))
    .replace('{y}', String(y));

  // The same ground width as one tile at the preview zoom, so both pictures have the same scale.
  const half = (Math.PI * EARTH_RADIUS_M) / tiles;
  const { x: cx, y: cy } = mercator(PREVIEW_CENTRE);
  const bbox = [cx - half, cy - half, cx + half, cy + half].map((v) => v.toFixed(1)).join(',');
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: AERIAL_LAYER,
    STYLES: '',
    CRS: 'EPSG:3857',
    BBOX: bbox,
    WIDTH: '256',
    HEIGHT: '256',
    FORMAT: 'image/jpeg',
  });
  return { aerial: `${AERIAL_URL}?${params}`, street };
}
