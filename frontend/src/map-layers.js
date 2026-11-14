import L from 'leaflet';
import { MAP_AREA } from './api/mapLink.js';
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
export const AERIAL_ATTRIBUTION =
  'Datenquelle: <a href="https://www.lgl-bw.de">LGL</a>, ' +
  '<a href="https://www.govdata.de/dl-de/by-2-0">dl-de/by-2-0</a>';

// The previews in the preferences show the middle of the Bildungscampus.
/**
 * Closest zoom of the campus map (Leaflet's numbers, about 21.26: 1.2 times as close as 21), also the following view
 * on a phone; the tiles are enlarged above the servers' own levels.
 */
export const MAX_ZOOM = 21 + Math.log2(1.2);
/** Middle and zoom (Leaflet's numbers) of the small map previews in the preferences. */
export const PREVIEW_CENTRE = { lat: 49.1476, lng: 9.2172 };
export const PREVIEW_ZOOM = 17;
const EARTH_RADIUS_M = 6378137;

/**
 * The aerial photo and the street map as two Leaflet layers. Only the street tiles get the `map-tiles--street`
 * class, so the dark theme's CSS filter and the street-map style never turn the photo into a negative; the photo's
 * `map-tiles--aerial` class carries its night look. Tiles are only fetched inside the map area.
 */
export function createBaseLayers({ minZoom }) {
  const area = L.latLngBounds([MAP_AREA.south, MAP_AREA.west], [MAP_AREA.north, MAP_AREA.east]);
  // Beyond the last level a server delivers, its tiles are enlarged instead of the layer disappearing. 512-pixel
  // pictures: a quarter as many requests to the photo server as 256-pixel ones, for the same sharpness.
  const aerial = L.tileLayer.wms(AERIAL_URL, {
    layers: AERIAL_LAYER,
    format: 'image/jpeg',
    version: '1.3.0',
    attribution: AERIAL_ATTRIBUTION,
    minZoom,
    maxZoom: MAX_ZOOM,
    // Level 19 is 0.2 m per pixel, the photo's own resolution (DOP20); closer, its pictures are enlarged.
    maxNativeZoom: 19,
    tileSize: 512,
    bounds: area,
    crossOrigin: true,
    className: 'map-tiles--aerial',
  });
  const street = L.tileLayer(STREET_URL, {
    attribution: STREET_ATTRIBUTION,
    minZoom,
    maxZoom: MAX_ZOOM,
    maxNativeZoom: 19,
    subdomains: 'abcd',
    bounds: area,
    crossOrigin: true,
    className: 'map-tiles--street',
  });
  return { aerial, street };
}

/**
 * Adds both map types to a Leaflet map with Leaflet's own switch (used by the admin's geofence editor) and starts
 * with the type chosen in the preferences.
 */
export function addBaseLayers(map, { minZoom, position = 'topright' }) {
  const { aerial, street } = createBaseLayers({ minZoom });
  (getMapBase() === 'street' ? street : aerial).addTo(map);
  L.control
    .layers({ [t('Aerial photo')]: aerial, [t('Street map')]: street }, undefined, { position })
    .addTo(map);
}

/**
 * The aerial photo as a tile address for the 3D map (MapLibre fills in each tile's Web Mercator box). Written by
 * hand because URLSearchParams would encode the placeholder's braces.
 */
export function aerialTileUrl() {
  const params = [
    'SERVICE=WMS',
    'VERSION=1.3.0',
    'REQUEST=GetMap',
    `LAYERS=${encodeURIComponent(AERIAL_LAYER)}`,
    'STYLES=',
    'CRS=EPSG:3857',
    'BBOX={bbox-epsg-3857}',
    'WIDTH=512',
    'HEIGHT=512',
    'FORMAT=image/jpeg',
  ];
  return `${AERIAL_URL}?${params.join('&')}`;
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
