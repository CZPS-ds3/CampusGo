import { t } from '../i18n.js';

const LAYERS_ICON = 'M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 10-5M2 17.5l10 5 10-5';

/**
 * Aerial photo or street map in one tap, a switch like the 2D/3D one: on (darker grey) = aerial photo,
 * off = street map.
 */
function BaseSwitch({ base, onBase }) {
  const aerial = base === 'aerial';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={aerial}
      aria-label={t('Aerial photo')}
      title={aerial ? t('Aerial photo') : t('Street map')}
      className="mapctl__btn mapctl__base"
      onClick={() => onBase(aerial ? 'street' : 'aerial')}
    >
      <svg
        className="mapctl__layers-icon"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        aria-hidden="true"
      >
        <path d={LAYERS_ICON} />
      </svg>
    </button>
  );
}

/** A compass needle that turns and tilts with the 3D map; a tap turns the map back to north. */
function Compass({ bearing, pitch, onNorth }) {
  return (
    <button
      type="button"
      className="mapctl__btn"
      aria-label={t('Point the map north')}
      title={t('Point the map north')}
      onClick={onNorth}
    >
      <svg
        className="mapctl__needle"
        viewBox="0 0 24 24"
        width="26"
        height="26"
        aria-hidden="true"
        style={{ transform: `rotateX(${pitch}deg) rotateZ(${-bearing}deg)` }}
      >
        <path className="mapctl__needle-north" d="M12 2 16 12H8Z" />
        <path className="mapctl__needle-south" d="M12 22 8 12h8Z" />
      </svg>
    </button>
  );
}

/**
 * The one set of map buttons on the map page, the same for the flat and the 3D map: compass (3D only), zoom,
 * the aerial/street switch and the 2D/3D switch. The flat map keeps an empty slot where the compass goes, so the buttons below
 * it stay in place when the view switches. The 2D/3D switch shows `switchView`, which changes at the tap, while
 * the compass follows the map until its animation is over. The switch shows the view that is on, so students can turn 3D off on a slow
 * phone.
 */
export function MapControls({ view, switchView = view, onToggleView, base, onBase, camera, map }) {
  return (
    <div className="mapctl" data-testid="map-controls">
      {view === '3d' ? (
        <div className="mapctl__group">
          <Compass
            bearing={camera.bearing}
            pitch={camera.pitch}
            onNorth={() => map.current?.north()}
          />
        </div>
      ) : (
        <div className="mapctl__slot" aria-hidden="true" />
      )}
      <div className="mapctl__group">
        <button
          type="button"
          className="mapctl__btn"
          aria-label={t('Zoom in')}
          title={t('Zoom in')}
          onClick={() => map.current?.zoomIn()}
        >
          <span aria-hidden="true">+</span>
        </button>
        <button
          type="button"
          className="mapctl__btn"
          aria-label={t('Zoom out')}
          title={t('Zoom out')}
          onClick={() => map.current?.zoomOut()}
        >
          <span aria-hidden="true">−</span>
        </button>
      </div>
      <div className="mapctl__group">
        <BaseSwitch base={base} onBase={onBase} />
      </div>
      <div className="mapctl__group">
        <button
          type="button"
          role="switch"
          aria-checked={switchView === '3d'}
          aria-label={t('3D map')}
          title={t('3D map')}
          className="mapctl__btn mapctl__view"
          onClick={onToggleView}
        >
          {switchView === '3d' ? '3D' : '2D'}
        </button>
      </div>
    </div>
  );
}

const NAV_ARROW = 'M12 2.5 19.5 20 12 15.6 4.5 20Z';

/**
 * Bottom-left button in the style of a navigation app: a round button while the map follows the visitor, a
 * "Re-centre" pill once they have moved the map away (or before the live location is on).
 */
export function RecenterButton({ following, onClick }) {
  return (
    <button
      type="button"
      className={`recenter${following ? ' is-following' : ''}`}
      aria-label={t('Re-centre')}
      title={t('Re-centre')}
      onClick={onClick}
      data-testid="recenter"
    >
      <svg className="recenter__icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d={NAV_ARROW} />
      </svg>
      <span className="recenter__text">{t('Re-centre')}</span>
    </button>
  );
}
