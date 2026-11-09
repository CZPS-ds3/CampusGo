import L from 'leaflet';
import { t } from './i18n.js';

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
// 'street' starts with the street map; any other value starts with the aerial photo.
const START_WITH_STREET = import.meta.env.VITE_MAP_BASE === 'street';

/**
 * Adds the aerial photo and the street map to a Leaflet map, with a switch between them, and starts with the aerial
 * photo. Only the street tiles get the `map-tiles--street` class, so the dark theme's CSS filter never turns the
 * photo into a negative.
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
  (START_WITH_STREET ? street : aerial).addTo(map);
  L.control
    .layers({ [t('Aerial photo')]: aerial, [t('Street map')]: street }, undefined, { position })
    .addTo(map);
}
