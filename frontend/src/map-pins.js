// The checkpoint pins are plain HTML, so the flat (Leaflet) and the 3D (MapLibre) map show the same pins and both
// take their colours from the map style's CSS variables (BR48).

/** Size of a pin's box and the point of it that sits on the checkpoint, in pixels. */
export const PIN_SIZE = [140, 70];
export const PIN_ANCHOR = [70, 22];

const stateOf = (checkpoint) => {
  if (checkpoint.completed) return 'done';
  return checkpoint.isActive ? 'open' : 'closed';
};

const PIN_ICON = {
  done: 'M4 12.5 9.5 18 20 6',
  open: 'M12 22S5 14.5 5 9.5a7 7 0 0 1 14 0C19 14.5 12 22 12 22ZM9.5 9.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0',
  closed: 'M5 11H19V21H5ZM8 11V7a4 4 0 0 1 8 0V11',
};

/** One diamond pin: ringed = open, green tick = done, padlock = closed. The name is stripped of markup. */
export function pinHtml(checkpoint, selected) {
  const state = stateOf(checkpoint);
  const ring = state === 'open' ? '<span class="pin__ring"></span>' : '';
  const name = checkpoint.name.replace(/[&<>"]/g, '');
  return `<span class="pin pin--${state}${selected ? ' is-selected' : ''}">
    <span class="pin__shape">${ring}<span class="pin__diamond"><svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${PIN_ICON[state]}"/></svg></span></span>
    <span class="pin__label">${name}</span>
  </span>`;
}

/**
 * Radius in metres of the soft blue circle around the live position: a sixth of the GPS accuracy, so a coarse
 * phone fix does not flood the close following view.
 */
export const accuracyCircleM = (accuracy) => accuracy / 6;

/** Size of the live-position puck in pixels; its middle sits on the position. */
export const PUCK_SIZE = 44;

/**
 * The visitor's live position: a blue disc with a white arrow, like a navigation app. `heading` (0 = north)
 * turns the arrow on the flat map; the 3D map turns the whole puck instead and passes `null`. Without a known
 * direction the arrow points up and is drawn a little lighter.
 */
export function puckHtml(heading) {
  const known = Number.isFinite(heading);
  const turn = known ? ` style="transform: rotate(${Math.round(heading)}deg)"` : '';
  return `<span class="puck${known ? '' : ' puck--still'}" aria-hidden="true">
    <span class="puck__pulse"></span>
    <span class="puck__disc"><svg class="puck__arrow" viewBox="0 0 24 24" width="18" height="18"${turn}><path d="M12 2.5 19.5 20 12 15.6 4.5 20Z"/></svg></span>
  </span>`;
}
