// The 3D map (MapLibre GL) draws OpenFreeMap's vector street map with the OSM building heights. OpenFreeMap needs
// no key and no account (like the OSM tiles of the flat map, decision D4). Everything in this file is plain data, so
// it is tested without WebGL; MapView3D.jsx only hands the result to MapLibre.
import { MAP_AREA } from './api/mapLink.js';
import { AERIAL_ATTRIBUTION, aerialTileUrl } from './map-layers.js';
import { DEFAULT_MAP_STYLE } from './mapStyle.js';

export const STYLE_URLS = {
  light: import.meta.env.VITE_MAP_3D_STYLE_LIGHT || 'https://tiles.openfreemap.org/styles/liberty',
  dark: import.meta.env.VITE_MAP_3D_STYLE_DARK || 'https://tiles.openfreemap.org/styles/dark',
};

/** The same area and zoom limits as the flat map, as MapLibre's [west, south], [east, north]. */
export const BOUNDS_3D = [
  [MAP_AREA.west, MAP_AREA.south],
  [MAP_AREA.east, MAP_AREA.north],
];
// MapLibre draws 512-pixel tiles where Leaflet draws 256-pixel ones, so the same scale is one zoom step lower.
// Zoom levels are kept in Leaflet's numbers everywhere else and converted here.
export const toGlZoom = (zoom) => zoom - 1;
export const fromGlZoom = (zoom) => zoom + 1;
export const MIN_ZOOM_3D = toGlZoom(14);
export const PITCH = 55;
export const BEARING = -20;

// The default building colour of the light street map, and a matching one for the dark map.
const DARK_BUILDINGS = '#3b434c';

/** Light or dark street map: the base of the map style, or the app theme when it follows the app (BR48). */
export const isDark = (style, theme) => (style.base === 'follow' ? theme : style.base) === 'dark';

/** The colour of the 3D buildings: the student's own, or the default that suits a light or dark map. */
export function buildingColour(style, dark) {
  if (style.buildings !== DEFAULT_MAP_STYLE.buildings) return style.buildings;
  return dark ? DARK_BUILDINGS : DEFAULT_MAP_STYLE.buildings;
}

const lineOf = (points) => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: points.map(([lat, lng]) => [lng, lat]) },
});
const collection = (features) => ({ type: 'FeatureCollection', features });

// The aerial photo at night: the same photo, darker, greyer and a little blue (no open night photo of Heilbronn exists).
const NIGHT_PAINT = {
  'raster-brightness-max': 0.42,
  'raster-saturation': -0.45,
  'raster-contrast': 0.12,
};
const NIGHT_VEIL = { colour: '#0b1d3f', opacity: 0.28 };
/** The aerial photo is only fetched for the map area, [west, south, east, north]. */
const AREA_BOUNDS = [MAP_AREA.west, MAP_AREA.south, MAP_AREA.east, MAP_AREA.north];

/** A copy of `layer` that is not drawn. */
const hidden = (layer) => ({ ...layer, layout: { ...layer.layout, visibility: 'none' } });

/**
 * The full MapLibre style: the downloaded street map plus, in this order, the tint, the aerial photo (with its night
 * veil), the 3D buildings (all below the labels), then the walking route and its dotted lead-in on top (the live
 * position and its sonar ring are markers). `flat` is the 2D view: the raised buildings are hidden, the street map's
 * own flat building outlines stay. Over the aerial photo the street map's areas and roads are not drawn (the photo
 * covers them), only its labels. `night` gives the photo its night look. Like the Leaflet map, the tint changes the
 * street map only and the aerial photo is never tinted (BR48). The base style is not changed.
 */
export function buildStyle(
  baseStyle,
  { mapStyle, dark, base, route = null, flat = false, night = false },
) {
  const style = structuredClone(baseStyle);
  // The street map's own extruded buildings are replaced by ours, which take the student's colour.
  const layers = style.layers.filter((layer) => layer.type !== 'fill-extrusion');
  // Some labels come before the roads in OpenFreeMap's styles, so the new layers go above the last road or area,
  // not below the first label; otherwise roads would be drawn over the aerial photo.
  const labelsAt = layers.findLastIndex((layer) => layer.type !== 'symbol') + 1;
  const aerial = base === 'aerial';
  const underPhoto = layers
    .slice(0, labelsAt)
    .map((layer) =>
      aerial && layer.type !== 'background' && layer.type !== 'symbol' ? hidden(layer) : layer,
    );

  style.sources = {
    ...style.sources,
    // 512-pixel pictures: a quarter as many requests to the photo server as 256-pixel ones, for the same sharpness.
    // Level 18 of them is 0.2 m per pixel, the photo's own resolution; closer, they are enlarged, not fetched again.
    'ccq-aerial': {
      type: 'raster',
      tiles: [aerialTileUrl()],
      tileSize: 512,
      maxzoom: 18,
      bounds: AREA_BOUNDS,
      attribution: AERIAL_ATTRIBUTION,
    },
    'ccq-route': { type: 'geojson', data: collection(route ? [lineOf(route.points)] : []) },
    'ccq-lead': { type: 'geojson', data: collection(route?.lead ? [lineOf(route.lead)] : []) },
  };

  const below = [];
  if (mapStyle.tint.strength > 0) {
    below.push({
      id: 'ccq-tint',
      type: 'background',
      paint: {
        'background-color': mapStyle.tint.color,
        'background-opacity': mapStyle.tint.strength / 100,
      },
    });
  }
  below.push(
    {
      id: 'ccq-aerial',
      type: 'raster',
      source: 'ccq-aerial',
      layout: { visibility: aerial ? 'visible' : 'none' },
      // A tile shows at once instead of fading in.
      paint: { 'raster-fade-duration': 0, ...(night && NIGHT_PAINT) },
    },
    {
      id: 'ccq-night',
      type: 'background',
      layout: { visibility: aerial && night ? 'visible' : 'none' },
      paint: { 'background-color': NIGHT_VEIL.colour, 'background-opacity': NIGHT_VEIL.opacity },
    },
    {
      id: 'ccq-buildings',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: MIN_ZOOM_3D,
      filter: ['!', ['has', 'hide_3d']],
      layout: { visibility: flat ? 'none' : 'visible' },
      paint: {
        // The photo is never themed, so its buildings keep the light default and let the roofs show through.
        'fill-extrusion-color': buildingColour(mapStyle, dark && !aerial),
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': aerial ? 0.55 : 0.85,
      },
    },
  );
  const routeLine = {
    id: 'ccq-route',
    type: 'line',
    source: 'ccq-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': mapStyle.route, 'line-width': 5, 'line-opacity': 0.9 },
  };
  if (route?.straight) routeLine.paint['line-dasharray'] = [0.2, 2];
  // The dotted curve from the visitor to the start of the route, as wide as the route.
  const leadLine = {
    id: 'ccq-lead',
    type: 'line',
    source: 'ccq-lead',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': mapStyle.route,
      'line-width': 5,
      'line-opacity': 0.9,
      'line-dasharray': [0.1, 2],
    },
  };

  style.layers = [...underPhoto, ...below, ...layers.slice(labelsAt), routeLine, leadLine];
  return style;
}

const downloads = new Map();

/** Downloads a street-map style once per page; a failed download is tried again next time. */
export function fetchBaseStyle(url, fetcher = fetch) {
  if (!downloads.has(url)) {
    const loading = fetcher(url).then((response) => {
      if (!response.ok) throw new Error(`Map style ${url} answered ${response.status}`);
      return response.json();
    });
    loading.catch(() => downloads.delete(url));
    downloads.set(url, loading);
  }
  return downloads.get(url);
}
