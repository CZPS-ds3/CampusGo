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

/** The red chevron of the Re-center button. */
export const CHEVRON = 'M6.5 15.5 12 8l5.5 7.5';

/**
 * Zoom (Leaflet's numbers) of the view that follows the live position and that Re-center flies to on a larger
 * screen: 2.2 x 1.2 times as close as zoom 19 (about 20.4), so the ball and the next few metres fill the screen.
 */
export const FOLLOW_ZOOM = 19 + Math.log2(2.2 * 1.2);
/** How far below the middle of the map the ball is shown while following, as a share of the map's height. */
export const FOLLOW_LOW = 0.2;
const SMALLEST = 0.3;

/**
 * How large the ball and its waves are drawn at a Leaflet zoom: full size in the following view and closer, smaller
 * (down to 30 %) when zoomed out, so a visitor who zoomed away is nudged to tap Re-center.
 */
export const puckScale = (zoom) => Math.min(1, Math.max(SMALLEST, 2 ** (zoom - FOLLOW_ZOOM)));

/** Hands the scale for `zoom` to the live-position markers inside a map's element (--puck-scale in screens.css). */
export function scalePuck(element, zoom) {
  element?.style.setProperty('--puck-scale', puckScale(zoom).toFixed(3));
}
// The accuracy circle keeps the size it had in the following view at zoom 19 x 2.2 (about 20.14).
const RING_ZOOM = 19 + Math.log2(2.2);

const EARTH_M = 40075016.686;
const M_PER_DEG = EARTH_M / 360;
const RING_MIN_PX = 20; // a little wider than the 28 px ball
const RING_MAX_PX = 80; // a coarse fix (a laptop on Wi-Fi) would otherwise fill the screen

/** Metres on the ground per screen pixel at a Leaflet zoom level (256-pixel tiles). */
export const metresPerPixel = (lat, zoom) =>
  (EARTH_M * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoom + 8);

/**
 * Radius in pixels of the soft circle round the ball: as large as a sixth of the GPS accuracy looks in the close
 * following view, and that size at every zoom, so it never vanishes when zooming out.
 */
export function accuracyRingPx(accuracy, lat) {
  const px = accuracy / 6 / metresPerPixel(lat, RING_ZOOM);
  return Math.round(Math.min(RING_MAX_PX, Math.max(RING_MIN_PX, px)));
}

/** Box of the ball marker in pixels (the ball is 28 or 42 px, see --puck-orb); its middle sits on the position. */
export const PUCK_SIZE = [44, 44];
export const PUCK_ANCHOR = [22, 22];
/** Box of the ground marker (sonar waves and direction wedge) in pixels; its middle sits on the position. */
export const GROUND_SIZE = 96;

// A few waves in a loop, one after another, like a submarine's sonar.
const WAVES = '<span class="puck-ground__wave"></span>'.repeat(3);

/**
 * What lies on the ground under the ball, below the checkpoint pins: sonar waves rolling out to as far as the GPS
 * accuracy reaches (`ringPx` radius) and the soft red wedge that points to the walking or compass direction
 * (`heading`, 0 = north; hidden while unknown).
 */
export function groundHtml(heading, ringPx) {
  const known = Number.isFinite(heading);
  return `<span class="puck-ground${known ? '' : ' puck-ground--still'}" aria-hidden="true">
    <span class="puck-ground__waves" style="width: ${ringPx * 2}px; height: ${ringPx * 2}px">${WAVES}</span>
    <span class="puck-ground__beam" style="transform: rotate(${Math.round(heading ?? 0)}deg)"></span>
  </span>`;
}

/** Updates the ground in place: the wedge turned to `heading` (hidden if null) and how far the waves go. */
export function updateGround(element, heading, ringPx) {
  const ground = element?.querySelector('.puck-ground');
  if (!ground) return;
  ground.classList.toggle('puck-ground--still', !Number.isFinite(heading));
  ground.querySelector('.puck-ground__beam').style.transform =
    `rotate(${Math.round(heading ?? 0)}deg)`;
  const waves = ground.querySelector('.puck-ground__waves').style;
  waves.width = `${ringPx * 2}px`;
  waves.height = `${ringPx * 2}px`;
}

// The ball is low-poly, like a geodesic dome: an icosahedron with each triangle split in four and pushed out onto a
// sphere, drawn from the front (only the facets facing the viewer). Every facet is white, with a grey veil for its
// light from the top left, and red lines between the facets. Its turn is kept per ball, so it can roll.
const GOLDEN = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON = {
  points: [
    [-1, GOLDEN, 0],
    [1, GOLDEN, 0],
    [-1, -GOLDEN, 0],
    [1, -GOLDEN, 0],
    [0, -1, GOLDEN],
    [0, 1, GOLDEN],
    [0, -1, -GOLDEN],
    [0, 1, -GOLDEN],
    [GOLDEN, 0, -1],
    [GOLDEN, 0, 1],
    [-GOLDEN, 0, -1],
    [-GOLDEN, 0, 1],
  ],
  faces: [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ],
};
const BALL_RADIUS = 48; // in the ball's 100 x 100 drawing
const BALL_PX = 21; // radius of the 42 px ball on screen, if it cannot be measured
const LIGHT = [-0.45, 0.55, 0.7]; // from the top left, towards the viewer (y up, z to the viewer)

const unit = (v) => {
  const length = Math.hypot(...v);
  return v.map((c) => c / length);
};
const dot = (a, b) => a.reduce((sum, c, i) => sum + c * b[i], 0);
const cross = ([a, b, c], [x, y, z]) => [b * z - c * y, c * x - a * z, a * y - b * x];
const between = (a, b) => unit(a.map((c, i) => (c + b[i]) / 2));
const apply = (matrix, v) => matrix.map((row) => dot(row, v));
const times = (a, b) => a.map((row) => [0, 1, 2].map((j) => dot(row, [b[0][j], b[1][j], b[2][j]])));

/** Rotation by `angle` (radians) round a unit `axis`. */
function rotation([x, y, z], angle) {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}

// Tilted towards the viewer and turned a little at the start, so the facets do not line up with the screen.
const START = times(rotation([0, 1, 0], 0.3), rotation([1, 0, 0], 0.45));

const FACES = (() => {
  const points = ICOSAHEDRON.points.map(unit);
  return ICOSAHEDRON.faces.flatMap(([a, b, c]) => {
    const [A, B, C] = [points[a], points[b], points[c]];
    const [ab, bc, ca] = [between(A, B), between(B, C), between(C, A)];
    return [
      [A, ab, ca],
      [ab, B, bc],
      [ca, bc, C],
      [ab, bc, ca],
    ];
  });
})();
const normalOf = (corners) => unit(corners.reduce((s, p) => s.map((c, i) => c + p[i])));

/** The veil that shades a facet for its light from the top left, as fill and opacity. */
function veil(normal) {
  const light = dot(normal, unit(LIGHT));
  // White facing the light, turning a soft grey towards the far edge, like a white low-poly ball.
  return ['#000', Math.min(0.4, Math.max(0, (0.75 - light) * 0.3))];
}

/** Each facet as seen with the ball turned by `matrix` (no points when it faces away), and the inner edges. */
/** The convex hull of points [x, y], in order round it: the outline of the ball as drawn. */
function hull(points) {
  const side = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (list) =>
    list.reduce((kept, p) => {
      while (kept.length >= 2 && side(kept.at(-2), kept.at(-1), p) <= 0) kept.pop();
      kept.push(p);
      return kept;
    }, []);
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return [...chain(sorted).slice(0, -1), ...chain([...sorted].reverse()).slice(0, -1)];
}

function shapes(matrix) {
  const at = (n) => Math.round(n * BALL_RADIUS * 10) / 10;
  const edges = new Map();
  const corners = [];
  const faces = FACES.map((face) => {
    const turned = face.map((p) => apply(matrix, p));
    const normal = normalOf(turned);
    if (normal[2] <= 0) return { points: '', veil: ['#000', 0] };
    turned.forEach(([x, y]) => corners.push([at(x), at(-y)]));
    const xy = turned.map(([x, y]) => `${at(x)},${at(-y)}`);
    xy.forEach((p, i) => {
      const key = [p, xy[(i + 1) % 3]].sort().join(' ');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    });
    return { points: xy.join(' '), veil: veil(normal) };
  });
  // Red lines between the facets; the outline is drawn round the whole ball instead.
  const inner = [...edges]
    .filter(([, count]) => count === 2)
    .map(([key]) => `M${key.replace(' ', 'L')}`)
    .join('');
  const outline = hull(corners)
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
  return { faces, inner, outline };
}

// A white backing the shape of the ball under the facets, so the map never shows through between them, and a thin
// red outline round it, so the white ball never seems to have a bite out of it on a light map.
function ballSvg() {
  const { faces, inner, outline } = shapes(START);
  const white = faces.map(({ points }) => `<polygon class="puck__facet" points="${points}"/>`);
  const light = faces.map(
    ({ points, veil: [fill, opacity] }) =>
      `<polygon class="puck__veil" points="${points}" fill="${fill}" fill-opacity="${opacity.toFixed(2)}"/>`,
  );
  return `<svg class="puck__ball" viewBox="-50 -50 100 100"><polygon class="puck__hull" points="${outline}"/>${white.join('')}${light.join('')}<path class="puck__edges" d="${inner}"/><polygon class="puck__outline" points="${outline}"/></svg>`;
}

const BALL = ballSvg();
const turns = new WeakMap();

/**
 * The visitor's live position: a white low-poly ball with red lines between its facets, sitting on the position
 * on the flat and the 3D map alike. It keeps its size at every zoom.
 */
export function puckHtml() {
  return `<span class="puck" aria-hidden="true">
    <span class="puck__body">${BALL}</span>
  </span>`;
}

/**
 * Rolls the ball the way it moved. `east` and `north` are the step on the ground in screen pixels; `bearing` and
 * `pitch` (degrees) are the 3D map's camera, so it rolls the right way however that map is turned or tilted.
 */
export function rollBall(element, east, north, { bearing = 0, pitch = 0 } = {}) {
  const svg = element?.querySelector('.puck__ball');
  if (!svg || (!east && !north)) return;
  const [b, p] = [(bearing * Math.PI) / 180, (pitch * Math.PI) / 180];
  // The step seen from the camera: to the right, and forward (away from the viewer, up the screen).
  const right = east * Math.cos(b) - north * Math.sin(b);
  const forward = east * Math.sin(b) + north * Math.cos(b);
  const step = [right, forward * Math.cos(p), -forward * Math.sin(p)];
  const ground = [0, Math.sin(p), Math.cos(p)];
  // A ball rolls round the line on the ground at right angles to its step, one radius per radian.
  const axis = unit(cross(ground, step));
  const radius = svg.getBoundingClientRect().width / 2 || BALL_PX;
  const matrix = times(
    rotation(axis, Math.hypot(right, forward) / radius),
    turns.get(svg) ?? START,
  );
  turns.set(svg, matrix);
  const { faces, inner, outline } = shapes(matrix);
  const white = svg.querySelectorAll('.puck__facet');
  const light = svg.querySelectorAll('.puck__veil');
  faces.forEach(({ points, veil: [fill, opacity] }, i) => {
    white[i].setAttribute('points', points);
    light[i].setAttribute('points', points);
    light[i].setAttribute('fill', fill);
    light[i].setAttribute('fill-opacity', opacity.toFixed(2));
  });
  svg.querySelector('.puck__edges').setAttribute('d', inner);
  for (const shape of svg.querySelectorAll('.puck__hull, .puck__outline')) {
    shape.setAttribute('points', outline);
  }
}

const GLIDE_MS = 900; // about the time between two readings while walking, so the ball keeps moving
const JUMP_M = 150; // further than a walk between two readings: jump instead of sliding across the map
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const nextFrame = (step) =>
  window.requestAnimationFrame ? window.requestAnimationFrame(step) : setTimeout(step, 16);
const cancelFrame = (frame) =>
  window.cancelAnimationFrame ? window.cancelAnimationFrame(frame) : clearTimeout(frame);

/**
 * Moves the live position smoothly from `from` to `to` ([lat, lng]) instead of jumping. `draw(at, east, north)`
 * gets every step, with its length on the ground in metres, so the ball can roll along. Returns a stop function.
 */
export function glide(from, to, draw) {
  const metres = (a, b) => [
    (b[1] - a[1]) * M_PER_DEG * Math.cos((a[0] * Math.PI) / 180),
    (b[0] - a[0]) * M_PER_DEG,
  ];
  if (reducedMotion() || Math.hypot(...metres(from, to)) > JUMP_M) {
    draw(to, 0, 0);
    return () => undefined;
  }
  const start = performance.now();
  let last = from;
  let frame = nextFrame(function step() {
    const t = Math.min(1, (performance.now() - start) / GLIDE_MS);
    const at = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    draw(at, ...metres(last, at));
    last = at;
    if (t < 1) frame = nextFrame(step);
  });
  return () => cancelFrame(frame);
}

/** How long a glide takes, for the map to follow at the same pace. */
export const GLIDE_SECONDS = GLIDE_MS / 1000;
