import L from 'leaflet';
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { Icon } from '../../components/icons.jsx';
import { formatNumber, t } from '../../i18n.js';
import { addBaseLayers } from '../../map-layers.js';
import {
  DEFAULT_GRACE_M,
  RADIUS_MAX,
  RADIUS_MIN,
  RADIUS_PRESETS,
  SLIDER_MAX,
  SLIDER_MIN,
  SLIDER_STEP,
  drawableRadius,
  formatMetres,
  overlappingQuests,
  radiusProblem,
} from './geofence.js';

const RED = '#e2001a';
const GREY = '#6b7780';

/**
 * Small map that draws the circle of a checkpoint to scale while the admin changes the radius: a solid circle for
 * the radius, a dashed ring for the extra tolerance students get, and the neighbouring checkpoints in grey.
 */
function GeofenceMap({ centre, radius, graceM, others, selfId }) {
  const container = useRef(null);
  const map = useRef(null);
  const layers = useRef(null);
  const fitted = useRef('');

  useEffect(() => {
    map.current = L.map(container.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      minZoom: 14,
    }).setView([centre.lat, centre.lng], 18);
    addBaseLayers(map.current, { minZoom: 14 });
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map.current);
    return () => {
      map.current.remove();
      map.current = null;
      layers.current = null;
      fitted.current = '';
    };
    // The map is created once; the next effect moves and redraws it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map.current) return;
    layers.current?.remove();
    const group = L.layerGroup();
    const middle = [centre.lat, centre.lng];
    for (const other of others) {
      if (other.id === selfId) continue;
      L.circle([other.lat, other.lng], {
        radius: other.radius,
        color: GREY,
        weight: 1.5,
        dashArray: '4 6',
        fillColor: GREY,
        fillOpacity: 0.08,
        interactive: false,
      })
        .bindTooltip(other.name, { permanent: true, direction: 'center', className: 'geo-tip' })
        .addTo(group);
    }
    if (Number.isFinite(radius)) {
      L.circle(middle, {
        radius: radius + graceM,
        color: RED,
        weight: 1.5,
        dashArray: '6 6',
        fill: false,
        interactive: false,
      }).addTo(group);
      L.circle(middle, {
        radius,
        color: RED,
        weight: 3,
        fillColor: RED,
        fillOpacity: 0.2,
        interactive: false,
      }).addTo(group);
    }
    L.circleMarker(middle, {
      radius: 6,
      color: '#ffffff',
      weight: 3,
      fillColor: RED,
      fillOpacity: 1,
      interactive: false,
    }).addTo(group);
    group.addTo(map.current);
    layers.current = group;

    // Keep the whole circle in view: refit when the place moves or the circle grows out of the picture.
    const key = `${centre.lat},${centre.lng}`;
    const bounds = L.latLng(middle).toBounds((Number.isFinite(radius) ? radius + graceM : 60) * 2);
    const view = map.current.getBounds();
    if (fitted.current !== key || !view.contains(bounds)) {
      map.current.fitBounds(bounds, { padding: [16, 16], animate: false, maxZoom: 19 });
      fitted.current = key;
    }
  }, [centre.lat, centre.lng, radius, graceM, others, selfId]);

  return <div ref={container} className="geo-preview__map map--darken" />;
}

/**
 * The radius of a checkpoint: a number field, a slider and size shortcuts, with the circle drawn on a map next to
 * them. `place` is the checked Google Maps position ({ lat, lng }) or the saved one; null shows a hint instead.
 */
export function GeofenceEditor({
  value,
  onChange,
  place,
  graceM = DEFAULT_GRACE_M,
  selfId = null,
}) {
  const id = useId();
  const [others, setOthers] = useState([]);
  const radius = drawableRadius(value);
  const problem = radiusProblem(value);
  const touching = overlappingQuests(
    place,
    radius,
    others.filter((other) => other.id !== selfId),
  );

  useEffect(() => {
    let alive = true;
    api.admin
      .quests()
      .then((result) => {
        if (!alive) return;
        setOthers(
          result.quests
            .filter((q) => !q.archived)
            .map((q) => ({ id: q.id, name: q.name, lat: q.lat, lng: q.lng, radius: q.radius })),
        );
      })
      // The neighbours are only context for the picture; the editor works without them.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const set = (next) => onChange(String(next));

  return (
    <fieldset className="geo card card--flat stack" aria-describedby={`${id}-summary`}>
      <legend className="caption field-label">{t('Area for the location check')}</legend>
      <div className="geo__controls">
        <div className="field-wrap geo__number">
          <label htmlFor={`${id}-radius`} className="caption field-label">
            {t('Radius (metres)')}
          </label>
          <input
            id={`${id}-radius`}
            className={`field${problem ? ' field-error' : ''}`}
            type="number"
            inputMode="numeric"
            min={RADIUS_MIN}
            max={RADIUS_MAX}
            step={1}
            value={value}
            aria-invalid={Boolean(problem) || undefined}
            aria-describedby={`${id}-summary`}
            onChange={(event) => set(event.target.value)}
          />
        </div>
        <div className="geo__slider">
          <label htmlFor={`${id}-slider`} className="caption field-label">
            {t('Drag to change the size')}
          </label>
          <input
            id={`${id}-slider`}
            type="range"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={SLIDER_STEP}
            value={
              Number.isFinite(radius) ? Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, radius)) : 80
            }
            aria-valuetext={Number.isFinite(radius) ? `${radius} m` : undefined}
            onChange={(event) => set(event.target.value)}
          />
        </div>
      </div>
      <div className="seg seg--4" role="radiogroup" aria-label={t('Quick sizes')}>
        {RADIUS_PRESETS.map((size) => (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={radius === size}
            onClick={() => set(size)}
          >
            {size} m
          </button>
        ))}
      </div>

      {place ? (
        <div className="geo-preview">
          <GeofenceMap
            centre={place}
            radius={radius}
            graceM={graceM}
            others={others}
            selfId={selfId}
          />
          <ul className="geo-legend" aria-hidden="true">
            <li>
              <span className="geo-legend__swatch geo-legend__swatch--circle" />
              {t('Checkpoint circle')}
            </li>
            <li>
              <span className="geo-legend__swatch geo-legend__swatch--ring" />
              {t('Extra tolerance')}
            </li>
            <li>
              <span className="geo-legend__swatch geo-legend__swatch--other" />
              {t('Other checkpoints')}
            </li>
          </ul>
        </div>
      ) : (
        <p className="card card--flat small muted" role="note">
          <Icon name="pin" size={18} />{' '}
          {t('Check the Google Maps link above to see the circle on the map.')}
        </p>
      )}

      <div id={`${id}-summary`} className="stack stack--tight" aria-live="polite">
        {problem ? (
          <p className="field-note field-note--error" role="alert">
            <Icon name="warn" size={18} />
            <span>
              {problem === 'format'
                ? t('Enter the radius as a whole number of metres.')
                : t('The radius must be between {min} and {max} metres.', {
                    min: RADIUS_MIN,
                    max: RADIUS_MAX,
                  })}
            </span>
          </p>
        ) : (
          <p className="small">
            {t(
              'The circle is about {size} across. A student also counts as inside up to {extra} m beyond it, so the zone reaches {reach} m from the centre.',
              {
                size: formatMetres(radius * 2),
                extra: graceM,
                reach: formatNumber(radius + graceM),
              },
            )}
          </p>
        )}
        {touching.length > 0 && (
          <p className="small muted">
            {t(
              'This circle overlaps {names}. That is fine: a spot always belongs to the checkpoint whose centre is nearest.',
              { names: touching.map((q) => q.name).join(', ') },
            )}
          </p>
        )}
      </div>
    </fieldset>
  );
}
