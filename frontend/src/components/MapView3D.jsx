import { LngLatBounds, Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { PIN_ANCHOR, PIN_SIZE, PUCK_SIZE, pinHtml, puckHtml } from '../map-pins.js';
import { useMapStyle } from '../mapStyle.js';

const CAMPUS_CENTER = [9.2165, 49.1485];
const PINS_PADDING = { top: 190, left: 60, bottom: 150, right: 60 };
const ROUTE_PADDING = { top: 200, left: 50, bottom: 150, right: 50 };
// Following the visitor looks a little steeper, like a navigation app.
const FOLLOW_PITCH = 60;

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

/** Tilted camera that shows all points, keeping the current turn of the map. */
function showAll(map, points, padding, animate) {
  const bounds = new LngLatBounds();
  for (const [lat, lng] of points) bounds.extend([lng, lat]);
  const camera = map.cameraForBounds(bounds, {
    padding,
    maxZoom: toGlZoom(18),
    bearing: map.getBearing(),
  });
  if (!camera) return;
  const target = { ...camera, pitch: PITCH };
  if (animate) map.easeTo({ ...target, essential: false });
  else map.jumpTo(target);
}

/**
 * The 3D campus map (MapLibre GL): OpenFreeMap street map or the LGL aerial photo with extruded buildings, the
 * same pins as the flat map, the live position and the student's map style (BR48). The buttons live outside the
 * map (MapControls); this component hands them a small camera API through `onReady`. `camera` is shared with the
 * flat map, so switching between 2D and 3D keeps the place and the zoom. `onFail` is called when the map cannot
 * be shown (no WebGL, map style not reachable), so the page can fall back to the flat map.
 */
export default function MapView3D({
  checkpoints,
  selectedId,
  onSelect,
  route = null,
  me = null,
  heading = null,
  base,
  camera,
  mayFitPins,
  onReady,
  onUserMove,
  onCamera,
  onFail,
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
  const latest = useRef({});
  latest.current = { onSelect, onReady, onUserMove, onCamera, onFail, mayFitPins, checkpoints };

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
    () => baseStyle && buildStyle(baseStyle, { mapStyle, dark, base, route, me }),
    [baseStyle, mapStyle, dark, base, route, me],
  );

  // The map is made once, with the first complete style; later changes are applied as a style diff.
  useEffect(() => {
    if (!style) return;
    if (map.current) {
      map.current.setStyle(style, { diff: true });
      return;
    }
    const saved = camera.current;
    // Coming from the flat map: the same place, zoom and north-up view, then a smooth tilt on the spot.
    const fromFlat = saved?.pitch === 0;
    let instance;
    try {
      instance = new MapLibreMap({
        container: container.current,
        style,
        center: saved ? [saved.center[1], saved.center[0]] : CAMPUS_CENTER,
        zoom: toGlZoom(saved?.zoom ?? 17),
        pitch: fromFlat ? 0 : PITCH,
        bearing: saved ? saved.bearing : BEARING,
        minZoom: MIN_ZOOM_3D,
        maxZoom: toGlZoom(MAX_ZOOM),
        maxPitch: 70,
        maxBounds: BOUNDS_3D,
        attributionControl: { compact: true },
      });
    } catch (error) {
      latest.current.onFail(error);
      return;
    }
    map.current = instance;
    closeCreditsOnce(container.current);
    if (fromFlat) {
      instance.once('load', () =>
        instance.easeTo({ pitch: PITCH, duration: 700, essential: false }),
      );
    }
    const report = () =>
      latest.current.onCamera({ bearing: instance.getBearing(), pitch: instance.getPitch() });
    instance.on('rotate', report);
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
    // Only the visitor's own dragging stops following; the zoom buttons and pinching keep it.
    instance.on('dragstart', (event) => event.originalEvent && latest.current.onUserMove());
    report();
    latest.current.onReady({
      zoomIn: () => instance.zoomIn(),
      zoomOut: () => instance.zoomOut(),
      north: () => instance.easeTo({ bearing: 0 }),
      flyTo: ([lat, lng], zoom) =>
        instance.flyTo({
          center: [lng, lat],
          zoom: toGlZoom(zoom),
          pitch: FOLLOW_PITCH,
          speed: 1.1,
          curve: 1.42,
          essential: false,
        }),
      panTo: ([lat, lng]) =>
        instance.easeTo({ center: [lng, lat], duration: 800, essential: false }),
      fitPoints: (points) => showAll(instance, points, ROUTE_PADDING, true),
      fitPins: () =>
        showAll(
          instance,
          latest.current.checkpoints.map((c) => [c.latitude, c.longitude]),
          PINS_PADDING,
          true,
        ),
    });
    setReady(true);
  }, [style, camera]);

  useEffect(() => {
    const markerStore = markers.current;
    return () => {
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
      );
    }
  }, [checkpoints, selectedId, ready, camera]);

  // The live position: a puck lying flat on the map and turned to the walking or compass direction.
  useEffect(() => {
    if (!ready) return;
    if (!me) {
      puck.current?.remove();
      puck.current = null;
      return;
    }
    if (!puck.current) {
      const element = document.createElement('div');
      element.className = 'puck-wrap';
      element.style.width = `${PUCK_SIZE}px`;
      element.style.height = `${PUCK_SIZE}px`;
      element.innerHTML = puckHtml(null);
      // MapLibre needs the position before the marker is added.
      puck.current = new Marker({ element, rotationAlignment: 'map', pitchAlignment: 'map' })
        .setLngLat([me.lng, me.lat])
        .addTo(map.current);
    }
    puck.current.setLngLat([me.lng, me.lat]).setRotation(heading ?? 0);
    puck.current.getElement().firstElementChild?.classList.toggle('puck--still', heading === null);
  }, [me, heading, ready]);

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
