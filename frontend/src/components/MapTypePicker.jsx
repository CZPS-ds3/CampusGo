import { useMemo } from 'react';
import { MAP_BASES, setSettings, t, useSettings } from '../i18n.js';
import { previewImages } from '../map-layers.js';

const NAMES = { aerial: 'Aerial photo', street: 'Street map' };

/**
 * Preference for the map type a map starts with on this device: two small previews side by side and, below them,
 * the same kind of segmented switch as the map style's light/dark choice. Students can still switch on the map.
 */
export function MapTypePicker() {
  const { mapBase } = useSettings();
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
    </div>
  );
}
