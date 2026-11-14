import { LngLatBounds, Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNight } from '../daylight.js';
import { useSonar } from '../hooks/useSonar.js';
import { t, useSettings } from '../i18n.js';
import {
  BEARING,
  BOUNDS_3D,
  MIN_ZOOM_3D,
  PITCH,
  STYLE_URLS,
  buildStyle,
  fetchBaseStyle,
  fromGlZoom,
  isDark,
  toGlZoom,
} from '../map-3d.js';
import { MAX_ZOOM } from '../map-layers.js';
import {
  FOLLOW_LOW,
  GLIDE_SECONDS,
  GROUND_SIZE,
  PIN_ANCHOR,
  PIN_SIZE,
  PUCK_SIZE,
  createFollower,
  groundHtml,
  metresPerPixel,
  pinHtml,
  puckHtml,
  rollBall,
  scalePuck,
  updateGround,
} from '../map-pins.js';
import { useMapStyle } from '../mapStyle.js';

const CAMPUS_CENTER = [9.2165, 49.1485];
const PINS_PADDING = { top: 190, left: 60, bottom: 150, right: 60 };
const ROUTE_PADDING = { top: 200, left: 50, bottom: 150, right: 50 };
// Following the visitor looks a little steeper, like a navigation app.
const FOLLOW_PITCH = 60;
const TILT_MS = 700;
const MAX_PITCH = 70;
const FLIGHT_LIMIT_MS = 5000;
/** The tilt of the view: none on the flat (2D) map, PITCH or the steeper following tilt in 3D. */
const pitchOf = (flat, following = false) => {
  if (flat) return 0;
  return following ? FOLLOW_PITCH : PITCH;
};

/** A focusable pin that opens its checkpoint with a click, Enter or Space, like the flat map's markers. */
function pinElement(checkpoint, selected, onSelect) {
  const element = document.createElement('div');
  element.className = 'pin-wrap map3d-pin';
  element.style.width = `${PIN_SIZE[0]}px`;
  element.style.height = `${PIN_SIZE[1]}px`;
  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', checkpoint.name);
  element.title = checkpoint.name;
  element.innerHTML = pinHtml(checkpoint, selected);
  element.addEventListener('click', (event) => {
    event.stopPropagation();
    onSelect();
  });
  element.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect();
  });
  return element;
}

/**
 * MapLibre opens its compact credits ("i") once when the map is small. They start closed here, like the flat
 * map's short credits; the "i" button opens them.
 */
function closeCreditsOnce(container) {
  const credits = container.querySelector('.maplibregl-ctrl-attrib');
  if (!credits) return;
  const close = () => {
    if (!credits.classList.contains('maplibregl-compact-show')) return false;
    credits.classList.remove('maplibregl-compact-show');
    credits.removeAttribute('open');
    return true;
  };
  if (close()) return;
  const watcher = new MutationObserver(() => close() && watcher.disconnect());
  watcher.observe(credits, { attributes: true, attributeFilter: ['class'] });
}

/** Camera that shows all points at the given tilt, keeping the current turn of the map. */
function showAll(map, points, padding, animate, pitch) {
  const bounds = new LngLatBounds();
  for (const [lat, lng] of points) bounds.extend([lng, lat]);
  const camera = map.cameraForBounds(bounds, {
    padding,
    maxZoom: toGlZoom(18),
    bearing: map.getBearing(),
  });
  if (!camera) return;
  const target = { ...camera, pitch };
  if (animate) map.easeTo({ ...target, essential: false });
  else map.jumpTo(target);
}

/**
 * The campus map in 2D and 3D (MapLibre GL): OpenFreeMap street map or the LGL aerial photo, the pins, the live
 * position and the student's map style (BR48). `flat` is the 2D view: no tilt and no raised buildings, but the map
 * still turns (two fingers, or the right mouse button); 3D tilts it and raises the buildings. A switch eases between
 * the two on the same map. The buttons live outside the map (MapControls); this component hands them a small camera
 * API through `onReady`. `camera` is shared with the Leaflet fallback, so a switch keeps the place and the zoom.
 * `onFail` is called when the map cannot be shown (no WebGL, map style not reachable), so the page can fall back
 * to the Leaflet map.
 */
export default function MapView3D({
  checkpoints,
  selectedId,
  onSelect,
  route = null,
  me = null,
  heading = null,
  base,
  flat = false,
  camera,
  mayFitPins,
  onReady,
  onUserMove,
  onCamera,
  onFail,
  switchTo,
}) {
  const container = useRef(null);
  const map = useRef(null);
  const markers = useRef(new Map());
  const puck = useRef(null);
  const [ready, setReady] = useState(false);
  const [baseStyle, setBaseStyle] = useState(null);
  const mapStyle = useMapStyle();
  const { theme } = useSettings();
  const dark = isDark(mapStyle, theme);
  const night = useNight();
  const resizeSonar = useSonar({
    container,
    zoomNow: () => (map.current ? fromGlZoom(map.current.getZoom()) : null),
    me,
    checkpoints,
    pinElement: (id) => markers.current.get(id)?.getElement(),
    pinsReady: ready,
  });
  const latest = useRef({});
  latest.current = {
    onSelect,
    onReady,
    onUserMove,
    onCamera,
    onFail,
    mayFitPins,
    checkpoints,
    heading,
    me,
    resizeSonar,
    flat,
  };

  useEffect(() => {
    let live = true;
    fetchBaseStyle(STYLE_URLS[dark ? 'dark' : 'light']).then(
      (style) => live && setBaseStyle(style),
      (error) => live && latest.current.onFail(error),
    );
    return () => {
      live = false;
    };
  }, [dark]);

  const style = useMemo(
    () => baseStyle && buildStyle(baseStyle, { mapStyle, dark, base, route, flat, night }),
    [baseStyle, mapStyle, dark, base, route, flat, night],
  );

  // The map is made once, with the first complete style; later changes are applied as a style diff.
  useEffect(() => {
    if (!style) return;
    if (map.current) {
      map.current.setStyle(style, { diff: true });
      return;
    }
    const saved = camera.current;
    const startFlat = latest.current.flat;
    // Coming from the Leaflet map (always flat and north up) into 3D: the same place and zoom, then a smooth tilt.
    const tiltIn = !startFlat && saved?.pitch === 0;
    let instance;
    try {
      instance = new MapLibreMap({
        container: container.current,
        style,
        center: saved ? [saved.center[1], saved.center[0]] : CAMPUS_CENTER,
        zoom: toGlZoom(saved?.zoom ?? 17),
        pitch: startFlat || tiltIn ? 0 : (saved?.pitch ?? PITCH),
        bearing: saved?.bearing ?? (startFlat ? 0 : BEARING),
        minZoom: MIN_ZOOM_3D,
        maxZoom: toGlZoom(MAX_ZOOM),
        // The 2D view cannot tilt; it can still turn.
        maxPitch: startFlat ? 0 : MAX_PITCH,
        maxBounds: BOUNDS_3D,
        attributionControl: { compact: true },
        // A phone with a very sharp screen draws at most twice its CSS pixels: the map stays sharp and draws faster.
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        // Tiles kept in the cache are not fetched again just because the server said they would expire.
        refreshExpiredTiles: false,
      });
    } catch (error) {
      latest.current.onFail(error);
      return;
    }
    map.current = instance;
    // MapLibre fires "load" once in a map's life. Later the style is briefly "not loaded" after every change (a route
    // update, a colour), so a flight must not wait for "load" again, or it would never start.
    let loadedOnce = false;
    instance.once('load', () => {
      loadedOnce = true;
    });
    closeCreditsOnce(container.current);
    // In the following view, the tilt-in goes straight into the 3D following view in one move.
    const target = switchTo?.current;
    if (tiltIn) {
      instance.once('load', () =>
        instance.easeTo({
          pitch: pitchOf(false, Boolean(target)),
          ...(target && {
            center: [target.point[1], target.point[0]],
            offset: [0, instance.getContainer().clientHeight * FOLLOW_LOW],
            zoom: toGlZoom(target.zoom),
          }),
          duration: TILT_MS,
          essential: false,
        }),
      );
    }
    const report = () =>
      latest.current.onCamera({ bearing: instance.getBearing(), pitch: instance.getPitch() });
    instance.on('rotate', report);
    // The live position shrinks and fades as the map zooms out; the sonar ring keeps the real unlock range.
    const scale = () => {
      scalePuck(container.current, fromGlZoom(instance.getZoom()));
      latest.current.resizeSonar();
    };
    instance.on('zoom', scale);
    scale();
    instance.on('pitch', report);
    instance.on('moveend', () => {
      const { lat, lng } = instance.getCenter();
      camera.current = {
        center: [lat, lng],
        zoom: fromGlZoom(instance.getZoom()),
        bearing: instance.getBearing(),
        pitch: instance.getPitch(),
      };
    });
    // Only the visitor's own dragging stops following; the zoom buttons and pinching keep it. Every step of a drag
    // counts, not only its start, so a drag that began during a camera move still stops following.
    const userDrag = (event) => event.originalEvent && latest.current.onUserMove();
    instance.on('dragstart', userDrag);
    instance.on('drag', userDrag);
    report();
    latest.current.onReady({
      zoomIn: () => instance.zoomIn(),
      zoomOut: () => instance.zoomOut(),
      north: () => instance.easeTo({ bearing: 0 }),
      // While following, the visitor is shown below the middle, so the ball sits low in the middle. Resolves when the
      // flight ends (or is stopped by a drag), so following does not cut it short.
      flyTo: ([lat, lng], zoom) =>
        new Promise((resolve) => {
          const fly = () => {
            instance.flyTo({
              center: [lng, lat],
              offset: [0, instance.getContainer().clientHeight * FOLLOW_LOW],
              zoom: toGlZoom(zoom),
              pitch: pitchOf(latest.current.flat, true),
              speed: 1.1,
              curve: 1.42,
              essential: false,
            });
            // Listened for only now: the flight first stops a follow pan that is still running, and the "moveend" of
            // that pan must not count as the end of the flight (the next pan would cut the flight short).
            if (instance.isMoving()) instance.once('moveend', resolve);
            else resolve();
          };
          // Never leave following waiting, whatever happens to the flight.
          setTimeout(resolve, FLIGHT_LIMIT_MS);
          // Right after a switch the map may still be loading its style for the first time; it flies once it has.
          if (loadedOnce || instance.isStyleLoaded()) fly();
          else instance.once('load', fly);
        }),
      // About as long as the ball takes to reach a new reading, so a walking visitor stays in the middle.
      panTo: ([lat, lng]) =>
        instance.easeTo({
          center: [lng, lat],
          offset: [0, instance.getContainer().clientHeight * FOLLOW_LOW],
          duration: GLIDE_SECONDS * 1000,
          easing: (t) => t,
          essential: false,
        }),
      fitPoints: (points) =>
        showAll(instance, points, ROUTE_PADDING, true, pitchOf(latest.current.flat)),
      fitPins: () =>
        showAll(
          instance,
          latest.current.checkpoints.map((c) => [c.latitude, c.longitude]),
          PINS_PADDING,
          true,
          pitchOf(latest.current.flat),
        ),
    });
    setReady(true);
  }, [style, camera, switchTo]);

  // 2D and 3D on the same map: the camera eases between flat and tilted where it is, keeping its turn; in the
  // following view it ends in the other view's following tilt. The buildings come and go with the style (flat).
  const shownFlat = useRef(flat);
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance || shownFlat.current === flat) return;
    shownFlat.current = flat;
    const target = switchTo?.current;
    // A running move (a follow pan) ends first, so it does not cut the tilt short.
    instance.stop();
    if (!flat) instance.setMaxPitch(MAX_PITCH);
    instance.easeTo({
      pitch: pitchOf(flat, Boolean(target)),
      ...(target && {
        center: [target.point[1], target.point[0]],
        offset: [0, instance.getContainer().clientHeight * FOLLOW_LOW],
        zoom: toGlZoom(target.zoom),
      }),
      duration: TILT_MS,
      essential: false,
    });
    // Once flat, the map can no longer be tilted by a gesture.
    if (flat) instance.once('moveend', () => shownFlat.current && instance.setMaxPitch(0));
  }, [flat, ready, switchTo]);

  useEffect(() => {
    const markerStore = markers.current;
    return () => {
      puck.current?.follower.stop();
      map.current?.remove();
      map.current = null;
      puck.current = null;
      markerStore.clear();
      latest.current.onReady(null);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    for (const checkpoint of checkpoints) {
      const selected = checkpoint.id === selectedId;
      const marker = markers.current.get(checkpoint.id);
      if (marker) {
        marker.getElement().innerHTML = pinHtml(checkpoint, selected);
        continue;
      }
      const element = pinElement(checkpoint, selected, () =>
        latest.current.onSelect(checkpoint.id),
      );
      markers.current.set(
        checkpoint.id,
        new Marker({ element, anchor: 'top-left', offset: [-PIN_ANCHOR[0], -PIN_ANCHOR[1]] })
          .setLngLat([checkpoint.longitude, checkpoint.latitude])
          .addTo(map.current),
      );
    }
    // The overview only on the very first view; after a 2D/3D switch the shared camera is kept.
    if (!camera.current && checkpoints.length > 0 && latest.current.mayFitPins()) {
      showAll(
        map.current,
        checkpoints.map((c) => [c.latitude, c.longitude]),
        PINS_PADDING,
        false,
        pitchOf(latest.current.flat),
      );
    }
  }, [checkpoints, selectedId, ready, camera]);

  // The live position as two markers. The ground (sonar ring and direction wedge) lies on the map and turns
  // with it, so the wedge keeps pointing the right way. The ball faces the screen, so however the map is turned or
  // tilted it stays round. Both follow the position every frame (walking on between readings); the ball rolls along.
  const lat = me?.lat;
  const lng = me?.lng;
  useEffect(() => {
    if (!ready) return;
    if (lat === undefined) {
      puck.current?.follower.stop();
      puck.current?.ground.remove();
      puck.current?.ball.remove();
      puck.current = null;
      return;
    }
    const point = [lat, lng];
    if (!puck.current) {
      const box = (width, height, html) => {
        const element = document.createElement('div');
        element.className = 'puck-wrap';
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
        element.innerHTML = html;
        return element;
      };
      const { heading: turn } = latest.current;
      const ball = box(PUCK_SIZE[0], PUCK_SIZE[1], puckHtml());
      ball.style.zIndex = '5'; // above the checkpoint pins, like on the flat map
      // MapLibre needs the position before a marker is added; the ground goes first, so it lies under the ball.
      puck.current = {
        ground: new Marker({
          element: box(GROUND_SIZE, GROUND_SIZE, groundHtml(turn)),
          rotationAlignment: 'map',
          pitchAlignment: 'map',
        })
          .setLngLat([lng, lat])
          .addTo(map.current),
        ball: new Marker({
          element: ball,
          rotationAlignment: 'viewport',
          pitchAlignment: 'viewport',
        })
          .setLngLat([lng, lat])
          .addTo(map.current),
      };
      const live = puck.current;
      live.follower = createFollower(point, (at, east, north) => {
        const instance = map.current;
        if (!instance) return;
        live.ground.setLngLat([at[1], at[0]]);
        live.ball.setLngLat([at[1], at[0]]);
        const px = metresPerPixel(at[0], fromGlZoom(instance.getZoom()));
        rollBall(live.ball.getElement(), east / px, north / px, {
          bearing: instance.getBearing(),
          pitch: instance.getPitch(),
        });
      });
      return;
    }
    puck.current.follower.moveTo(point, latest.current.me?.velocity);
  }, [lat, lng, ready]);

  // The direction changes in place, so a compass reading never interrupts the ball's movement.
  useEffect(() => {
    if (!ready || !puck.current) return;
    updateGround(puck.current.ground.getElement(), heading);
  }, [heading, lat, ready]);

  return (
    <div
      ref={container}
      className="map map3d"
      role="region"
      aria-label={t('Campus map')}
      data-testid="map-3d"
    />
  );
}
