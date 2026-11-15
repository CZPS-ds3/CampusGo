import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapView } from '../src/components/MapView.jsx';
import { ToastProvider } from '../src/hooks/useToast.jsx';
import { setSettings } from '../src/i18n.js';
import { CHEVRON } from '../src/map-pins.js';

// Leaflet draws circles and lines only when the browser says it can draw SVG; jsdom lacks this one method.
vi.hoisted(() => {
  window.SVGSVGElement.prototype.createSVGRect = () => ({});
});

// jsdom has no WebGL, so the map starts on the Leaflet fallback; MapLibre is only checked for falling back here
// (map-view-gl.test.jsx fakes WebGL). Playwright covers the real MapLibre map.
vi.mock('maplibre-gl', () => ({
  LngLatBounds: vi.fn(),
  Map: vi.fn(),
  Marker: vi.fn(),
}));

const CHECKPOINTS = [
  { id: 1, name: 'Test point', latitude: 49.148, longitude: 9.216, isActive: true },
];
const renderMap = (props = {}) =>
  render(
    <ToastProvider>
      <MapView checkpoints={CHECKPOINTS} selectedId={null} onSelect={() => {}} {...props} />
    </ToastProvider>,
  );
const viewSwitch = () => screen.getByRole('switch', { name: '3D map' });

// These tests start on the aerial photo (new accounts start on the street map).
beforeEach(() => act(() => setSettings({ mapBase: 'aerial' })));

describe('campus map: one set of buttons for the flat and the 3D map', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    act(() => setSettings({ mapView: '2d', mapBase: 'aerial' }));
  });

  it('without WebGL starts on the flat Leaflet map with zoom, map type and a 2D/3D switch', () => {
    const { container } = renderMap();
    expect(container.querySelector('.leaflet-container')).not.toBeNull();
    expect(viewSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(viewSwitch()).toHaveTextContent('2D');
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Aerial photo' })).toBeInTheDocument();
    // The Leaflet fallback cannot turn, so it has no compass.
    expect(screen.queryByRole('button', { name: 'Point the map north' })).toBeNull();
    // Leaflet's own buttons are replaced by the shared set.
    expect(container.querySelector('.leaflet-control-zoom')).toBeNull();
  });

  it('switches aerial photo and street map in one tap, on the same map', async () => {
    const { container } = renderMap();
    const aerial = screen.getByRole('switch', { name: 'Aerial photo' });
    expect(aerial).toHaveAttribute('aria-checked', 'true');
    expect(container.querySelector('.map-tiles--street')).toBeNull();
    await userEvent.click(aerial);
    expect(aerial).toHaveAttribute('aria-checked', 'false');
    expect(container.querySelector('.map-tiles--street')).not.toBeNull();
    expect(container.querySelectorAll('.leaflet-container')).toHaveLength(1);
    await userEvent.click(aerial);
    expect(container.querySelector('.map-tiles--street')).toBeNull();
  });

  it('falls back to the flat map and says so when the 3D map cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 })),
    );
    renderMap();
    await userEvent.click(viewSwitch());

    expect(
      await screen.findByText('The 3D map could not be loaded, so the flat map is shown.'),
    ).toBeInTheDocument();
    expect(viewSwitch()).toHaveTextContent('2D');
  });

  it('opens with the 3D map when that is the preference, with a compass', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    act(() => setSettings({ mapView: '3d' }));
    renderMap();
    expect(await screen.findByTestId('map-3d')).toBeInTheDocument();
    expect(viewSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(viewSwitch()).toHaveTextContent('3D');
    expect(screen.getByRole('button', { name: 'Point the map north' })).toBeInTheDocument();
  });
});

describe('live location on the map', () => {
  it('Re-center asks for the location when it is not on yet', async () => {
    const onLocate = vi.fn();
    renderMap({ onLocate });
    await userEvent.click(screen.getByRole('button', { name: 'Re-center' }));
    expect(onLocate).toHaveBeenCalledTimes(1);
  });

  it('Re-center explains a blocked location instead of asking again', async () => {
    const onLocate = vi.fn();
    renderMap({ onLocate, locationStatus: 'denied' });
    await userEvent.click(screen.getByRole('button', { name: 'Re-center' }));
    expect(onLocate).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Location is blocked in your browser, so the map cannot follow you.'),
    ).toBeInTheDocument();
  });

  it('turns the direction wedge on the ground to the walking direction', () => {
    const { container } = renderMap({
      me: { lat: 49.148, lng: 9.216, accuracy: 12 },
      heading: 90,
    });
    expect(container.querySelector('.puck-ground__beam').style.transform).toBe('rotate(90deg)');
    // While following, Re-center is the small round button.
    expect(screen.getByTestId('recenter')).toHaveClass('is-following');
  });

  it('BR12 draws Re-center with the red chevron and only the sonar range ring under the ball', () => {
    const { container } = renderMap({ me: { lat: 49.148, lng: 9.216, accuracy: 12 } });
    expect(screen.getByTestId('recenter').querySelector('path').getAttribute('d')).toBe(CHEVRON);
    // The old red waves of the GPS accuracy are gone; the sonar ring shows the unlock range instead.
    expect(container.querySelector('.puck-ground__waves')).toBeNull();
    expect(container.querySelector('.puck-ground__wave')).toBeNull();
    expect(container.querySelectorAll('.puck-ground .puck-sonar__wave')).toHaveLength(1);
    // Markers, not circles in metres drawn by Leaflet.
    expect(container.querySelector('.leaflet-overlay-pane path')).toBeNull();
  });

  it('draws the live position as a still, white low-poly ball with lines between its facets, nothing round it', () => {
    const { container } = renderMap({ me: { lat: 49.148, lng: 9.216, accuracy: 12 } });
    expect(container.querySelector('.puck .puck__ball')).not.toBeNull();
    for (const gone of ['glow', 'shadow', 'shine']) {
      expect(container.querySelector(`.puck__${gone}`)).toBeNull();
    }
    expect(container.querySelector('.puck__edges').getAttribute('d')).toMatch(/^M/);
    // Only the facets facing the viewer are drawn: about half of the 80.
    const drawn = [...container.querySelectorAll('.puck__facet')].filter((f) =>
      f.getAttribute('points'),
    );
    expect(drawn.length).toBeGreaterThan(30);
    expect(drawn.length).toBeLessThan(50);
    // The direction wedge always shows: north until a direction is known.
    const beam = container.querySelector('.puck-ground__beam');
    expect(beam).toBeVisible();
    expect(beam.style.transform).toBe('rotate(0deg)');
  });

  it('BR51 does not follow a position outside the map area', async () => {
    renderMap({ me: { lat: 52.52, lng: 13.4, accuracy: 12 } });
    expect(screen.getByTestId('recenter')).not.toHaveClass('is-following');
    await userEvent.click(screen.getByRole('button', { name: 'Re-center' }));
    expect(
      await screen.findByText('You are outside the map area, so the map shows the campus.'),
    ).toBeInTheDocument();
  });
});
