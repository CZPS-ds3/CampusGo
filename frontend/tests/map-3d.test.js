import { describe, expect, it, vi } from 'vitest';
import { MAP_AREA } from '../src/api/mapLink.js';
import {
  BOUNDS_3D,
  STYLE_URLS,
  buildStyle,
  buildingColour,
  fetchBaseStyle,
  fromGlZoom,
  isDark,
  toGlZoom,
} from '../src/map-3d.js';
import { aerialTileUrl } from '../src/map-layers.js';
import { DEFAULT_MAP_STYLE, PRESETS, cleanStyle } from '../src/mapStyle.js';

// A tiny street-map style in the shape of OpenFreeMap's (base layers, its own 3D buildings, labels).
const BASE = {
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://example.test/planet' } },
  layers: [
    { id: 'background', type: 'background' },
    { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building' },
    { id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles' },
    { id: 'road-label', type: 'symbol', source: 'openmaptiles' },
  ],
};
const ids = (style) => style.layers.map((layer) => layer.id);
const layer = (style, id) => style.layers.find((l) => l.id === id);
const options = (patch = {}) => ({
  mapStyle: DEFAULT_MAP_STYLE,
  dark: false,
  base: 'street',
  ...patch,
});

describe('3D map style', () => {
  it('puts tint, aerial photo and buildings below the labels, and route and position on top', () => {
    const tinted = cleanStyle({ ...DEFAULT_MAP_STYLE, tint: { color: '#9ad0f5', strength: 30 } });
    const style = buildStyle(BASE, options({ mapStyle: tinted }));
    expect(ids(style)).toEqual([
      'background',
      'building',
      'ccq-tint',
      'ccq-aerial',
      'ccq-night',
      'ccq-buildings',
      'road-label',
      'ccq-route',
      'ccq-lead',
    ]);
    expect(BASE.layers).toHaveLength(4); // the downloaded style is not changed
  });

  it('BR48 the tint works like on the flat map: strength 30 % lets 70 % of the street map through', () => {
    const tinted = cleanStyle({ ...DEFAULT_MAP_STYLE, tint: { color: '#9ad0f5', strength: 30 } });
    const { paint } = layer(buildStyle(BASE, options({ mapStyle: tinted })), 'ccq-tint');
    expect(paint).toEqual({ 'background-color': '#9ad0f5', 'background-opacity': 0.3 });
    expect(layer(buildStyle(BASE, options()), 'ccq-tint')).toBeUndefined();
  });

  it('BR48 the aerial photo is drawn above the tint, so it is never tinted, and only when chosen', () => {
    const street = buildStyle(BASE, options());
    const aerial = buildStyle(BASE, options({ base: 'aerial' }));
    expect(layer(street, 'ccq-aerial').layout.visibility).toBe('none');
    expect(layer(aerial, 'ccq-aerial').layout.visibility).toBe('visible');
    expect(aerial.sources['ccq-aerial'].tiles).toEqual([aerialTileUrl()]);
  });

  it('puts the new layers above the last road even when a label comes before the roads', () => {
    const mixed = {
      ...BASE,
      layers: [
        { id: 'background', type: 'background' },
        { id: 'water-name', type: 'symbol', source: 'openmaptiles' },
        { id: 'road', type: 'line', source: 'openmaptiles' },
        { id: 'road-label', type: 'symbol', source: 'openmaptiles' },
      ],
    };
    expect(ids(buildStyle(mixed, options()))).toEqual([
      'background',
      'water-name',
      'road',
      'ccq-aerial',
      'ccq-night',
      'ccq-buildings',
      'road-label',
      'ccq-route',
      'ccq-lead',
    ]);
  });

  it('BR48 over the aerial photo the buildings keep the light default and let the roofs show', () => {
    const photo = layer(buildStyle(BASE, options({ dark: true, base: 'aerial' })), 'ccq-buildings');
    const street = layer(buildStyle(BASE, options({ dark: true })), 'ccq-buildings');
    expect(photo.paint['fill-extrusion-color']).toBe(DEFAULT_MAP_STYLE.buildings);
    expect(street.paint['fill-extrusion-color']).not.toBe(DEFAULT_MAP_STYLE.buildings);
    expect(photo.paint['fill-extrusion-opacity']).toBeLessThan(
      street.paint['fill-extrusion-opacity'],
    );
  });

  it('over the aerial photo only the labels of the street map are drawn; the photo covers the rest', () => {
    const photo = buildStyle(BASE, options({ base: 'aerial' }));
    expect(layer(photo, 'building').layout.visibility).toBe('none');
    expect(layer(photo, 'background').layout?.visibility).toBeUndefined();
    expect(layer(photo, 'road-label').layout?.visibility).toBeUndefined();
    expect(layer(buildStyle(BASE, options()), 'building').layout?.visibility).toBeUndefined();
  });

  it('fetches the aerial photo as 512-pixel pictures, only inside the map area, shown at once', () => {
    const style = buildStyle(BASE, options({ base: 'aerial' }));
    expect(style.sources['ccq-aerial']).toMatchObject({
      tileSize: 512,
      maxzoom: 18,
      bounds: [MAP_AREA.west, MAP_AREA.south, MAP_AREA.east, MAP_AREA.north],
    });
    expect(aerialTileUrl()).toContain('WIDTH=512&HEIGHT=512');
    expect(layer(style, 'ccq-aerial').paint['raster-fade-duration']).toBe(0);
  });

  it('gives the aerial photo a night look after sunset, and only the aerial photo', () => {
    const night = buildStyle(BASE, options({ base: 'aerial', night: true }));
    expect(layer(night, 'ccq-aerial').paint['raster-brightness-max']).toBeLessThan(0.5);
    expect(layer(night, 'ccq-night').layout.visibility).toBe('visible');
    const day = buildStyle(BASE, options({ base: 'aerial' }));
    expect(layer(day, 'ccq-aerial').paint['raster-brightness-max']).toBeUndefined();
    expect(layer(day, 'ccq-night').layout.visibility).toBe('none');
    // The street map has no night look: it follows light or dark.
    const street = buildStyle(BASE, options({ night: true }));
    expect(layer(street, 'ccq-night').layout.visibility).toBe('none');
  });

  it('the 2D view is the same map without raised buildings; 3D raises them', () => {
    const flat = layer(buildStyle(BASE, options({ flat: true })), 'ccq-buildings');
    const tilted = layer(buildStyle(BASE, options()), 'ccq-buildings');
    expect(flat.layout.visibility).toBe('none');
    expect(tilted.layout.visibility).toBe('visible');
  });

  it('BR48 buildings and route take the colours of the map style', () => {
    const style = buildStyle(BASE, options({ mapStyle: PRESETS.ocean }));
    expect(layer(style, 'ccq-buildings').paint['fill-extrusion-color']).toBe('#c5dcef');
    expect(layer(style, 'ccq-route').paint['line-color']).toBe(PRESETS.ocean.route);
  });

  it('draws the walking route from [lat, lng] points, dotted when it is a straight line', () => {
    const route = {
      points: [
        [49.1, 9.2],
        [49.2, 9.3],
      ],
      straight: true,
    };
    const style = buildStyle(BASE, options({ route }));
    expect(style.sources['ccq-route'].data.features[0].geometry.coordinates).toEqual([
      [9.2, 49.1],
      [9.3, 49.2],
    ]);
    expect(layer(style, 'ccq-route').paint['line-dasharray']).toEqual([0.2, 2]);
    const walked = buildStyle(BASE, options({ route: { ...route, straight: false } }));
    expect(layer(walked, 'ccq-route').paint['line-dasharray']).toBeUndefined();
    expect(buildStyle(BASE, options()).sources['ccq-route'].data.features).toEqual([]);
  });

  it('BR48 the default building colour suits a light or a dark map; a chosen colour is always kept', () => {
    expect(buildingColour(DEFAULT_MAP_STYLE, false)).toBe(DEFAULT_MAP_STYLE.buildings);
    expect(buildingColour(DEFAULT_MAP_STYLE, true)).not.toBe(DEFAULT_MAP_STYLE.buildings);
    expect(buildingColour({ ...DEFAULT_MAP_STYLE, buildings: '#123456' }, true)).toBe('#123456');
  });

  it('BR48 light or dark follows the app theme unless the map style fixes it', () => {
    expect(isDark({ base: 'follow' }, 'dark')).toBe(true);
    expect(isDark({ base: 'follow' }, 'light')).toBe(false);
    expect(isDark({ base: 'light' }, 'dark')).toBe(false);
    expect(isDark({ base: 'dark' }, 'light')).toBe(true);
    expect(STYLE_URLS.light).not.toBe(STYLE_URLS.dark);
  });

  it('leaves the live position and its sonar ring to markers, so they can move fluidly', () => {
    const style = buildStyle(BASE, options());
    expect(style.sources['ccq-me']).toBeUndefined();
    expect(layer(style, 'ccq-accuracy')).toBeUndefined();
  });

  it('draws the curve from the visitor to the start of the route dotted, as wide as the route', () => {
    const route = {
      points: [
        [49.1, 9.2],
        [49.2, 9.3],
      ],
      lead: [
        [49.09, 9.19],
        [49.1, 9.2],
      ],
    };
    const style = buildStyle(BASE, options({ route }));
    const lead = layer(style, 'ccq-lead');
    expect(style.sources['ccq-lead'].data.features[0].geometry.coordinates).toEqual([
      [9.19, 49.09],
      [9.2, 49.1],
    ]);
    expect(lead.paint['line-dasharray']).toBeDefined();
    expect(lead.paint['line-width']).toBe(layer(style, 'ccq-route').paint['line-width']);
    expect(buildStyle(BASE, options()).sources['ccq-lead'].data.features).toEqual([]);
  });

  it('keeps the same scale as the flat map: MapLibre zoom is one step below Leaflet zoom', () => {
    expect(toGlZoom(18)).toBe(17);
    expect(fromGlZoom(toGlZoom(16.4))).toBeCloseTo(16.4, 10);
  });

  it('BR51 the 3D map cannot leave the same area as the flat map', () => {
    expect(BOUNDS_3D).toEqual([
      [MAP_AREA.west, MAP_AREA.south],
      [MAP_AREA.east, MAP_AREA.north],
    ]);
  });

  it('asks the aerial photo service for Web Mercator tiles with the box left for MapLibre to fill in', () => {
    const url = aerialTileUrl();
    expect(url).toContain('BBOX={bbox-epsg-3857}');
    expect(url).toContain('CRS=EPSG:3857');
    expect(url).toContain('LAYERS=IMAGES_DOP_20_RGB');
  });

  it('downloads a street-map style once and tries again after a failure', async () => {
    const ok = vi.fn(async () => ({ ok: true, json: async () => BASE }));
    await fetchBaseStyle('https://example.test/a', ok);
    await fetchBaseStyle('https://example.test/a', ok);
    expect(ok).toHaveBeenCalledTimes(1);

    const broken = vi.fn(async () => ({ ok: false, status: 503 }));
    await expect(fetchBaseStyle('https://example.test/b', broken)).rejects.toThrow(/503/);
    await expect(fetchBaseStyle('https://example.test/b', broken)).rejects.toThrow(/503/);
    expect(broken).toHaveBeenCalledTimes(2);
  });
});
