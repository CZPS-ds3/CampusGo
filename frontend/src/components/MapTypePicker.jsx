import { useMemo } from 'react';
import { MAP_BASES, MAP_VIEWS, setSettings, t, useSettings } from '../i18n.js';
import { previewImages } from '../map-layers.js';

const NAMES = { aerial: 'Aerial photo', street: 'Street map' };
const VIEW_NAMES = { '2d': 'Flat (2D)', '3d': '3D with buildings' };

/**
 * Preference for the map type a map starts with on this device: two small previews side by side and, below them,
 * the same kind of segmented switch as the map style's light/dark choice, then the view: flat (2D) or tilted with
 * buildings (3D). Both work with either map type. Students can still switch both on the map.
 */
export function MapTypePicker() {
  const { mapBase, mapView } = useSettings();
  const images = useMemo(previewImages, []);
  return (
    <div data-testid="map-type">
      <p className="strong">{t('Default map')}</p>
      <p className="small muted">{t('The map you see first. You can still switch on the map.')}</p>
      <div className="mappick mt-s">
        {MAP_BASES.map((id) => (
          <button
            key={id}
            type="button"
            tabIndex={-1}
            className="mappick__card"
            aria-hidden="true"
            data-selected={mapBase === id || undefined}
            onClick={() => setSettings({ mapBase: id })}
          >
            <img className="mappick__img" src={images[id]} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      <div className="seg seg--2 mt-s" role="radiogroup" aria-label={t('Default map')}>
        {MAP_BASES.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mapBase === id}
            onClick={() => setSettings({ mapBase: id })}
          >
            {t(NAMES[id])}
          </button>
        ))}
      </div>
      <div className="seg seg--2 mt-s" role="radiogroup" aria-label={t('Map view')}>
        {MAP_VIEWS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mapView === id}
            onClick={() => setSettings({ mapView: id })}
          >
            {t(VIEW_NAMES[id])}
          </button>
        ))}
      </div>
      <p className="small muted mt-s">
        {t(
          'The 3D map tilts the map and raises the buildings. It needs more power on older phones.',
        )}
      </p>
    </div>
  );
}
