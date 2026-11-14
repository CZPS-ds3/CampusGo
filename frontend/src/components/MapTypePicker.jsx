import { Suspense, lazy, useMemo } from 'react';
import { useNight } from '../daylight.js';
import { canDrawWebGl } from '../device.js';
import { MAP_VIEWS, setSettings, t, useSettings } from '../i18n.js';
import { previewImages } from '../map-layers.js';

const NAMES = { aerial: 'Aerial photo', street: 'Street map' };
// The street map on the left, the aerial photo on the right.
const BASES = ['street', 'aerial'];
const VIEW_NAMES = { '2d': '2D', '3d': '3D' };

/** A plain preview picture; `night` gives the aerial photo the night look it has on the map. */
function Picture({ src, night = false }) {
  return (
    <img
      className={`mappick__img${night ? ' mappick__img--night' : ''}`}
      src={src}
      alt=""
      loading="lazy"
    />
  );
}

// The live street-map preview needs MapLibre, which is downloaded apart from the app; if that download fails, the
// picture stands in.
const StreetPreview = lazy(() =>
  import('./StreetPreview.jsx').catch(() => ({
    default: ({ fallback }) => <Picture src={fallback} />,
  })),
);

/**
 * Preference for the map a map starts with on this device: two small previews side by side and, below them, the
 * same kind of segmented switch as the light/dark choice, then the view: 2D (flat, turnable) or 3D (tilted with
 * buildings). Both work with either map type. Students can still switch both on the map. The street-map preview is
 * drawn like the 2D map itself where this browser can draw it.
 */
export function MapTypePicker() {
  const { mapBase, mapView } = useSettings();
  const images = useMemo(previewImages, []);
  const night = useNight();
  return (
    <div data-testid="map-type">
      <p className="strong">{t('Default map')}</p>
      <p className="small muted">{t('The map you see first. You can still switch on the map.')}</p>
      <div className="mappick mt-s">
        {BASES.map((id) => (
          <button
            key={id}
            type="button"
            tabIndex={-1}
            className="mappick__card"
            aria-hidden="true"
            data-selected={mapBase === id || undefined}
            onClick={() => setSettings({ mapBase: id })}
          >
            {id === 'street' && canDrawWebGl() ? (
              <Suspense fallback={<Picture src={images.street} />}>
                <StreetPreview fallback={images.street} />
              </Suspense>
            ) : (
              <Picture src={images[id]} night={id === 'aerial' && night} />
            )}
          </button>
        ))}
      </div>
      <div className="seg seg--2 mt-s" role="radiogroup" aria-label={t('Default map')}>
        {BASES.map((id) => (
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
      <p className="small muted mt-s">
        {t(
          'The aerial photo also adapts to the time of day: after sunset it shows a dark version.',
        )}
      </p>
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
        {t('3D requires more resources to be loaded. Not recommended for older devices.')}
      </p>
    </div>
  );
}
