// The campus map with WebGL: MapLibre draws both views. 2D is flat with no raised buildings but can turn; 3D tilts
// the same map. jsdom has no WebGL, so it is faked here and MapLibre is replaced by a recorder; Playwright covers the
// real drawing.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapView } from '../src/components/MapView.jsx';
import { ToastProvider } from '../src/hooks/useToast.jsx';
import { setSettings } from '../src/i18n.js';
import { PITCH } from '../src/map-3d.js';

const gl = vi.hoisted(() => {
  window.WebGLRenderingContext = function WebGLRenderingContext() {};
  window.HTMLCanvasElement.prototype.getContext = () => ({ getExtension: () => null });
  window.SVGSVGElement.prototype.createSVGRect = () => ({});
  return { maps: [] };
});

vi.mock('maplibre-gl', () => {
  class FakeMap {
    constructor(options) {
      this.options = options;
      this.calls = [];
      this.handlers = {};
      this.bearing = options.bearing;
      this.pitch = options.pitch;
      gl.maps.push(this);
    }
    on(name, handler) {
      (this.handlers[name] ??= []).push(handler);
      return this;
    }
    once(name, handler) {
      return this.on(name, handler);
    }
    fire(name) {
      for (const handler of this.handlers[name] ?? []) handler({});
    }
    getBearing() {
      return this.bearing;
    }
    getPitch() {
      return this.pitch;
    }
    getZoom() {
      return 16;
    }
    getCenter() {
      return { lat: 49.1485, lng: 9.2165 };
    }
    getContainer() {
      return this.options.container;
    }
    isStyleLoaded() {
      return true;
    }
    cameraForBounds() {
      return null;
    }
    stop() {
      return this;
    }
    easeTo(options) {
      this.calls.push(['easeTo', options]);
      if (options.pitch !== undefined) this.pitch = options.pitch;
      return this;
    }
    setMaxPitch(value) {
      this.calls.push(['setMaxPitch', value]);
      return this;
    }
    setStyle(style) {
      this.calls.push(['setStyle', style]);
      return this;
    }
    remove() {}
  }
  class FakeMarker {
    constructor({ element } = {}) {
      this.element = element ?? document.createElement('div');
    }
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    getElement() {
      return this.element;
    }
    remove() {}
  }
  class FakeBounds {
    extend() {
      return this;
    }
  }
  return { Map: FakeMap, Marker: FakeMarker, LngLatBounds: FakeBounds };
});

const CHECKPOINTS = [
  { id: 1, name: 'Test point', latitude: 49.148, longitude: 9.216, isActive: true },
];
const STREET_STYLE = { version: 8, sources: {}, layers: [] };
const viewSwitch = () => screen.getByRole('switch', { name: '3D map' });
const buildings = (style) => style.layers.find((layer) => layer.id === 'ccq-buildings');
const calls = (map, name) => map.calls.filter(([call]) => call === name).map(([, arg]) => arg);

async function renderMap() {
  render(
    <ToastProvider>
      <MapView checkpoints={CHECKPOINTS} selectedId={null} onSelect={() => {}} />
    </ToastProvider>,
  );
  await waitFor(() => expect(gl.maps).toHaveLength(1));
  return gl.maps[0];
}

beforeEach(() => {
  gl.maps = [];
  // The faked WebGL counts as a strong device, whose new accounts start in 3D; these tests start in 2D.
  act(() => setSettings({ mapView: '2d' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => STREET_STYLE })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => setSettings({ mapView: '2d', mapBase: 'aerial', theme: 'light' }));
});

describe('the campus map with WebGL: one turnable MapLibre map for 2D and 3D', () => {
  it('opens in 2D on MapLibre: flat, no raised buildings, turnable, with a compass', async () => {
    const map = await renderMap();
    expect(screen.getByTestId('map-3d')).toBeInTheDocument();
    expect(document.querySelector('.leaflet-container')).toBeNull();
    expect(map.options).toMatchObject({ pitch: 0, maxPitch: 0, bearing: 0 });
    expect(buildings(map.options.style).layout.visibility).toBe('none');
    // It can turn, so the compass is there to turn it back to north.
    expect(screen.getByRole('button', { name: 'Point the map north' })).toBeInTheDocument();
    expect(viewSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(viewSwitch()).toHaveTextContent('2D');
  });

  it('switches to 3D and back on the same map: it tilts and raises the buildings, then flattens again', async () => {
    const user = userEvent.setup();
    const map = await renderMap();

    await user.click(viewSwitch());
    expect(viewSwitch()).toHaveTextContent('3D');
    expect(calls(map, 'setMaxPitch')).toContain(70);
    expect(calls(map, 'easeTo').at(-1)).toMatchObject({ pitch: PITCH });
    // The turn of the map is kept: the switch only changes the tilt.
    expect(calls(map, 'easeTo').at(-1)).not.toHaveProperty('bearing');
    await waitFor(() =>
      expect(buildings(calls(map, 'setStyle').at(-1)).layout.visibility).toBe('visible'),
    );

    await user.click(viewSwitch());
    expect(viewSwitch()).toHaveTextContent('2D');
    expect(calls(map, 'easeTo').at(-1)).toMatchObject({ pitch: 0 });
    await waitFor(() =>
      expect(buildings(calls(map, 'setStyle').at(-1)).layout.visibility).toBe('none'),
    );
    // Once flat, a gesture can no longer tilt it.
    act(() => map.fire('moveend'));
    expect(calls(map, 'setMaxPitch').at(-1)).toBe(0);
    expect(gl.maps).toHaveLength(1);
  });

  it('falls back to the flat Leaflet map and says so when MapLibre cannot load in 2D', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 })),
    );
    // The light street map was downloaded (and kept) by the tests above; the dark one is still to be fetched.
    act(() => setSettings({ theme: 'dark' }));
    render(
      <ToastProvider>
        <MapView checkpoints={CHECKPOINTS} selectedId={null} onSelect={() => {}} />
      </ToastProvider>,
    );
    expect(
      await screen.findByText(
        'The turnable map could not be loaded, so a simpler flat map is shown.',
      ),
    ).toBeInTheDocument();
    expect(document.querySelector('.leaflet-container')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Point the map north' })).toBeNull();
  });
});
