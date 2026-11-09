import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MapTypePicker } from '../src/components/MapTypePicker.jsx';
import { getMapBase, setSettings } from '../src/i18n.js';
import { previewImages } from '../src/map-layers.js';

describe('Preferences: default map type', () => {
  afterEach(() => act(() => setSettings({ mapBase: 'aerial' })));

  it('starts with the aerial photo and switches to the street map from the selector', async () => {
    render(<MapTypePicker />);
    const aerial = screen.getByRole('radio', { name: 'Aerial photo' });
    const street = screen.getByRole('radio', { name: 'Street map' });
    expect(aerial).toHaveAttribute('aria-checked', 'true');
    expect(street).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(street);

    expect(street).toHaveAttribute('aria-checked', 'true');
    expect(getMapBase()).toBe('street');
    expect(JSON.parse(localStorage.getItem('ccq-settings-v1')).mapBase).toBe('street');
  });

  it('shows a preview of both map types side by side', () => {
    const { container } = render(<MapTypePicker />);
    const images = container.querySelectorAll('.mappick__img');
    expect(images).toHaveLength(2);
    const { aerial, street } = previewImages();
    expect(images[0]).toHaveAttribute('src', aerial);
    expect(images[1]).toHaveAttribute('src', street);
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
