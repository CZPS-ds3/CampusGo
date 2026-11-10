import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapView } from '../src/components/MapView.jsx';
import { ToastProvider } from '../src/hooks/useToast.jsx';
import { setSettings } from '../src/i18n.js';

// Leaflet draws circles and lines only when the browser says it can draw SVG; jsdom lacks this one method.
vi.hoisted(() => {
  window.SVGSVGElement.prototype.createSVGRect = () => ({});
});

// jsdom has no WebGL; the 3D map is only checked for falling back. Playwright covers the real 3D map.
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

describe('campus map: one set of buttons for the flat and the 3D map', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    act(() => setSettings({ mapView: '2d', mapBase: 'aerial' }));
  });

  it('starts flat with zoom, map type and a 2D/3D switch that shows the view that is on', () => {
    const { container } = renderMap();
    expect(container.querySelector('.leaflet-container')).not.toBeNull();
    expect(viewSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(viewSwitch()).toHaveTextContent('2D');
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Aerial photo' })).toBeInTheDocument();
    // The flat map cannot turn, so it has no compass.
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
  it('Re-centre asks for the location when it is not on yet', async () => {
    const onLocate = vi.fn();
    renderMap({ onLocate });
    await userEvent.click(screen.getByRole('button', { name: 'Re-centre' }));
    expect(onLocate).toHaveBeenCalledTimes(1);
  });

  it('Re-centre explains a blocked location instead of asking again', async () => {
    const onLocate = vi.fn();
    renderMap({ onLocate, locationStatus: 'denied' });
    await userEvent.click(screen.getByRole('button', { name: 'Re-centre' }));
    expect(onLocate).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Location is blocked in your browser, so the map cannot follow you.'),
    ).toBeInTheDocument();
  });

  it('shows the puck with its arrow turned to the walking direction', () => {
    const { container } = renderMap({
      me: { lat: 49.148, lng: 9.216, accuracy: 12 },
      heading: 90,
    });
    expect(container.querySelector('.puck__arrow').style.transform).toBe('rotate(90deg)');
    // While following, Re-centre is the small round button.
    expect(screen.getByTestId('recenter')).toHaveClass('is-following');
  });

  it('BR51 does not follow a position outside the map area', async () => {
    renderMap({ me: { lat: 52.52, lng: 13.4, accuracy: 12 } });
    expect(screen.getByTestId('recenter')).not.toHaveClass('is-following');
    await userEvent.click(screen.getByRole('button', { name: 'Re-centre' }));
    expect(
      await screen.findByText('You are outside the map area, so the map shows the campus.'),
    ).toBeInTheDocument();
  });
});
