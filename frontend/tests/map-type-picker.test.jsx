import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MapTypePicker } from '../src/components/MapTypePicker.jsx';
import { getMapBase, getMapView, setSettings } from '../src/i18n.js';
import { previewImages } from '../src/map-layers.js';

describe('Preferences: default map type', () => {
  afterEach(() => act(() => setSettings({ mapBase: 'street', mapView: '2d' })));

  it('starts with the street map and switches to the aerial photo from the selector', async () => {
    render(<MapTypePicker />);
    const aerial = screen.getByRole('radio', { name: 'Aerial photo' });
    const street = screen.getByRole('radio', { name: 'Street map' });
    expect(street).toHaveAttribute('aria-checked', 'true');
    expect(aerial).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(aerial);

    expect(aerial).toHaveAttribute('aria-checked', 'true');
    expect(getMapBase()).toBe('aerial');
    expect(JSON.parse(localStorage.getItem('ccq-settings-v1')).mapBase).toBe('aerial');
  });

  it('says under 2D and 3D that 3D needs more resources', () => {
    render(<MapTypePicker />);
    expect(
      screen.getByText(
        '3D requires more resources to be loaded. Not recommended for older devices.',
      ),
    ).toBeInTheDocument();
  });

  it('starts in 2D and offers 3D as the default view, separately from the map type', async () => {
    render(<MapTypePicker />);
    const flat = screen.getByRole('radio', { name: '2D' });
    const tilted = screen.getByRole('radio', { name: '3D' });
    expect(flat).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(tilted);

    expect(tilted).toHaveAttribute('aria-checked', 'true');
    expect(getMapView()).toBe('3d');
    expect(getMapBase()).toBe('street');
    expect(JSON.parse(localStorage.getItem('ccq-settings-v1')).mapView).toBe('3d');
  });

  it('shows a preview of both map types side by side, the street map on the left (a picture without WebGL)', () => {
    const { container } = render(<MapTypePicker />);
    const images = container.querySelectorAll('.mappick__img');
    expect(images).toHaveLength(2);
    const { aerial, street } = previewImages();
    expect(images[0]).toHaveAttribute('src', street);
    expect(images[1]).toHaveAttribute('src', aerial);
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      'Street map',
      'Aerial photo',
      '2D',
      '3D',
    ]);
  });

  it('builds preview addresses for the campus: an aerial picture in Web Mercator and one street tile', () => {
    const { aerial, street } = previewImages();
    const params = new URL(aerial).searchParams;
    expect(params.get('CRS')).toBe('EPSG:3857');
    expect(params.get('LAYERS')).toBe('IMAGES_DOP_20_RGB');
    const [minX, minY, maxX, maxY] = params.get('BBOX').split(',').map(Number);
    expect(maxX - minX).toBeCloseTo(maxY - minY, 0);
    expect(street).toMatch(/\/17\/\d+\/\d+\.png$/);
  });
});
