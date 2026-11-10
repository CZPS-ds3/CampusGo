import L from 'leaflet';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { insideMapArea } from '../geo.js';
import { useToast } from '../hooks/useToast.jsx';
import { getMapBase, getMapView, t } from '../i18n.js';
import { MAX_ZOOM, createBaseLayers } from '../map-layers.js';
import {
  FOLLOW_LOW,
  FOLLOW_ZOOM,
  GLIDE_SECONDS,
  GROUND_SIZE,
  PIN_ANCHOR,
  PIN_SIZE,
  PUCK_ANCHOR,
  PUCK_SIZE,
  accuracyRingPx,
  glide,
  groundHtml,
  metresPerPixel,
  pinHtml,
  puckHtml,
  rollBall,
  updateGround,
} from '../map-pins.js';
import { useMapStyle } from '../mapStyle.js';
import { MapControls, RecenterButton } from './MapControls.jsx';

// The street tiles are light; in the dark theme a CSS filter darkens them (VITE_MAP_DARKEN=false for tiles that are dark already).
const DARKEN = import.meta.env.VITE_MAP_DARKEN !== 'false';
// The map may not leave the Heilbronn area (a few kilometres around the Bildungscampus).
const CAMPUS_CENTER = [49.1485, 9.2165];
const MAX_BOUNDS = L.latLngBounds([49.12, 9.17], [49.18, 9.26]);
const MIN_ZOOM = 14;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/** The zoom of the following view: on a phone as close as the map goes, on a larger screen FOLLOW_ZOOM. */
const followZoom = () =>
  window.matchMedia?.('(max-width: 767px)').matches ? MAX_ZOOM : FOLLOW_ZOOM;

// MapLibre is large, so it is only downloaded when someone opens the 3D map. If the download fails, the stand-in
// reports it and the page shows the flat map again.
const MapView3D = lazy(() =>
  import('./MapView3D.jsx').catch((error) => ({
    default: function Unavailable({ onFail }) {
      useEffect(() => onFail(error), [onFail]);
      return null;
    },
  })),
);

const pinIcon = (checkpoint, selected) =>
  L.divIcon({
    className: 'pin-wrap',
    iconSize: PIN_SIZE,
    iconAnchor: PIN_ANCHOR,
    html: pinHtml(checkpoint, selected),
  });

const fitOptions = (top) => ({
  paddingTopLeft: [60, top],
  paddingBottomRight: [60, 150],
  maxZoom: 18,
});

/**
 * Flat Leaflet map with one diamond pin per checkpoint: ringed = open, green tick = done, padlock = closed, plus
 * the walking route and the live position. The buttons live outside the map (MapControls); this component hands
 * them a small camera API through `onReady`. `camera` is shared with the 3D map, so a switch keeps place and zoom.
 */
function MapView2D({
  checkpoints,
  selectedId,
  onSelect,
  route,
  me,
  heading,
  base,
  camera,
  mayFitPins,
  onReady,
  onUserMove,
}) {
  const container = useRef(null);
  const map = useRef(null);
  const layers = useRef(null);
  const markers = useRef(new Map());
  const routeLine = useRef(null);
  const leadLine = useRef(null);
  const puck = useRef(null);
  const style = useMapStyle();
  const latest = useRef({});
  latest.current = { onSelect, onReady, onUserMove, mayFitPins, checkpoints, heading, me };

  useEffect(() => {
    const saved = camera.current;
    const instance = L.map(container.current, {
      zoomControl: false,
      attributionControl: true,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      // Any zoom level, so a switch from the 3D map keeps exactly the zoom the student had.
      zoomSnap: 0,
      zoomDelta: 1,
      maxBounds: MAX_BOUNDS,
      maxBoundsViscosity: 1,
    }).setView(saved?.center ?? CAMPUS_CENTER, saved?.zoom ?? 17);
    map.current = instance;
    layers.current = createBaseLayers({ minZoom: MIN_ZOOM });
    // The flat map looks straight down with north up; the 3D map starts from exactly this view and tilts from
    // it. Saved at once too, so a switch right after opening also starts flat.
    const save = () => {
      const { lat, lng } = instance.getCenter();
      camera.current = { center: [lat, lng], zoom: instance.getZoom(), bearing: 0, pitch: 0 };
    };
    instance.on('moveend', save);
    save();
    instance.on('dragstart', () => latest.current.onUserMove());
    // While following, the map's middle is a little above the visitor, so the ball sits low in the middle.
    const followCentre = (point, zoom = instance.getZoom()) =>
      instance.unproject(
        instance.project(point, zoom).subtract(L.point(0, instance.getSize().y * FOLLOW_LOW)),
        zoom,
      );
    const fly = (point, zoom) =>
      reducedMotion()
        ? instance.setView(followCentre(point, zoom), zoom)
        : instance.flyTo(followCentre(point, zoom), zoom, { duration: 1.2, easeLinearity: 0.2 });
    latest.current.onReady({
      zoomIn: () => instance.zoomIn(),
      zoomOut: () => instance.zoomOut(),
      north: () => undefined,
      flyTo: fly,
      // At the pace of the ball's glide, so a walking visitor stays in the middle.
      panTo: (point) =>
        instance.panTo(followCentre(point), {
          animate: !reducedMotion(),
          duration: GLIDE_SECONDS,
          easeLinearity: 1,
        }),
      fitPoints: (points) => instance.flyToBounds(L.latLngBounds(points), fitOptions(200)),
      fitPins: () =>
        instance.flyToBounds(
          L.latLngBounds(latest.current.checkpoints.map((c) => [c.latitude, c.longitude])),
          fitOptions(190),
        ),
    });
    const markerStore = markers.current;
    return () => {
      latest.current.onReady(null);
      instance.remove();
      map.current = null;
      markerStore.clear();
      routeLine.current = null;
      leadLine.current = null;
      puck.current?.stop();
      puck.current = null;
    };
  }, [camera]);

  // Aerial photo or street map: the layers are swapped, the camera stays where it is.
  useEffect(() => {
    const { aerial, street } = layers.current;
    const [show, hide] = base === 'street' ? [street, aerial] : [aerial, street];
    hide.remove();
    show.addTo(map.current);
  }, [base]);

  useEffect(() => {
    for (const checkpoint of checkpoints) {
      const selected = checkpoint.id === selectedId;
      let marker = markers.current.get(checkpoint.id);
      if (!marker) {
        marker = L.marker([checkpoint.latitude, checkpoint.longitude], {
          icon: pinIcon(checkpoint, selected),
          title: checkpoint.name,
          alt: checkpoint.name,
          keyboard: true,
        }).addTo(map.current);
        marker.on('click', () => latest.current.onSelect(checkpoint.id));
        markers.current.set(checkpoint.id, marker);
      } else {
        marker.setIcon(pinIcon(checkpoint, selected));
      }
    }
    // The overview only on the very first view (room for the player card and the GO badge); after a 2D/3D switch
    // the shared camera is kept.
    if (!camera.current && checkpoints.length > 0 && latest.current.mayFitPins()) {
      map.current.fitBounds(
        L.latLngBounds(checkpoints.map((c) => [c.latitude, c.longitude])),
        fitOptions(190),
      );
    }
  }, [checkpoints, selectedId, camera]);

  // The walking route, updated in place as the visitor walks (only the part still ahead is drawn).
  useEffect(() => {
    if (!route) {
      routeLine.current?.remove();
      routeLine.current = null;
      return;
    }
    const look = {
      color: style.route,
      weight: 5,
      opacity: 0.9,
      dashArray: route.straight ? '2 10' : null,
      lineCap: 'round',
      interactive: false,
    };
    if (routeLine.current) routeLine.current.setLatLngs(route.points).setStyle(look);
    else routeLine.current = L.polyline(route.points, look).addTo(map.current);
  }, [route, style.route]);

  // The dotted curve from the visitor to the start of the route, as wide as the route.
  useEffect(() => {
    if (!route?.lead) {
      leadLine.current?.remove();
      leadLine.current = null;
      return;
    }
    const look = {
      color: style.route,
      weight: 5,
      opacity: 0.9,
      dashArray: '1 10',
      lineCap: 'round',
      interactive: false,
    };
    if (leadLine.current) leadLine.current.setLatLngs(route.lead).setStyle(look);
    else leadLine.current = L.polyline(route.lead, look).addTo(map.current);
  }, [route, style.route]);

  // The live position as two markers: the ground (accuracy circle and direction wedge, below the pins) and the ball
  // on top. Both glide from reading to reading, and the ball rolls the way it moved.
  const lat = me?.lat;
  const lng = me?.lng;
  useEffect(() => {
    if (lat === undefined) {
      puck.current?.stop();
      puck.current?.ground.remove();
      puck.current?.ball.remove();
      puck.current = null;
      return;
    }
    const point = [lat, lng];
    if (!puck.current) {
      const marker = (html, size, anchor, zIndexOffset) =>
        L.marker(point, {
          icon: L.divIcon({ className: 'puck-wrap', iconSize: size, iconAnchor: anchor, html }),
          interactive: false,
          keyboard: false,
          zIndexOffset,
        }).addTo(map.current);
      const { heading: turn, me: here } = latest.current;
      puck.current = {
        ground: marker(
          groundHtml(turn, accuracyRingPx(here.accuracy, lat)),
          [GROUND_SIZE, GROUND_SIZE],
          [GROUND_SIZE / 2, GROUND_SIZE / 2],
          -1000,
        ),
        ball: marker(puckHtml(), PUCK_SIZE, PUCK_ANCHOR, 1000),
        at: point,
        stop: () => undefined,
      };
      return;
    }
    const live = puck.current;
    live.stop();
    live.stop = glide(live.at, point, (at, east, north) => {
      if (!map.current) return;
      live.at = at;
      live.ground.setLatLng(at);
      live.ball.setLatLng(at);
      const px = metresPerPixel(at[0], map.current.getZoom());
      rollBall(live.ball.getElement(), east / px, north / px);
    });
  }, [lat, lng]);

  // Direction and accuracy change in place, so a compass reading never interrupts the glide.
  const accuracy = me?.accuracy;
  useEffect(() => {
    if (!puck.current || accuracy === undefined) return;
    updateGround(puck.current.ground.getElement(), heading, accuracyRingPx(accuracy, lat));
  }, [heading, accuracy, lat]);

  return (
    <div
      ref={container}
      className={`map${DARKEN ? ' map--darken' : ''}`}
      role="region"
      aria-label={t('Campus map')}
    />
  );
}

/**
 * The campus map. It starts flat (2D) or tilted with buildings (3D), and with the aerial photo or the street map,
 * as chosen in the preferences; the buttons switch both without moving the camera. With the live location on, the
 * map follows the visitor closely; moving the map stops that, and "Re-center" flies back.
 *
 * `route` is the part of the walking route still ahead, `fitRoute` counts the routes the visitor asked for (the map
 * zooms out to each new one), `me` is the live position { lat, lng, accuracy } and `onLocate` starts it.
 */
export function MapView({
  checkpoints,
  selectedId,
  onSelect,
  route = null,
  fitRoute = 0,
  me = null,
  heading = null,
  locationStatus = 'off',
  onLocate = () => {},
}) {
  const toast = useToast();
  const [view, setView] = useState(getMapView);
  const [base, setBase] = useState(getMapBase);
  const [following, setFollowing] = useState(true);
  // Flat and north up until the 3D map reports its real turn and tilt.
  const [turn, setTurn] = useState({ bearing: 0, pitch: 0 });
  const [mapVersion, setMapVersion] = useState(0);
  const api = useRef(null);
  const camera = useRef(null);
  const centred = useRef(false);
  const switching = useRef(false);
  // The view the switch shows: it changes at the tap, before the map has finished animating to it.
  const [switchView, setSwitchView] = useState(view);
  const followed = useRef('');
  const here = me && insideMapArea([me.lat, me.lng]) ? me : null;
  const latest = useRef({});
  latest.current = { following, here, route };

  const onReady = useCallback((value) => {
    api.current = value;
    if (value) setMapVersion((n) => n + 1);
  }, []);
  const onUserMove = useCallback(() => setFollowing(false), []);
  const mayFitPins = useCallback(() => !(latest.current.following && latest.current.here), []);

  // Following: the first position flies in close, later ones pan gently. A 2D/3D switch alone never moves the map.
  const hereLat = here?.lat;
  const hereLng = here?.lng;
  useEffect(() => {
    if (!api.current || !following || hereLat === undefined) return;
    const point = [hereLat, hereLng];
    const key = point.join(',');
    if (centred.current) {
      if (followed.current !== key) api.current.panTo(point);
    } else {
      centred.current = true;
      api.current.flyTo(point, followZoom());
    }
    followed.current = key;
  }, [hereLat, hereLng, following, mapVersion]);

  // A new route the visitor asked for: show all of it, and stop following until "Re-center".
  useEffect(() => {
    const shown = latest.current.route;
    if (!fitRoute || !shown) return;
    setFollowing(false);
    api.current?.fitPoints(shown.points);
  }, [fitRoute]);

  const recenter = () => {
    if (locationStatus === 'denied') {
      toast.info(t('Location is blocked in your browser, so the map cannot follow you.'));
      return;
    }
    setFollowing(true);
    // Every tap starts the location if needed and, on iOS, asks for the compass, which a tap alone may do.
    onLocate();
    if (!me) {
      centred.current = false; // the first position will fly in
      return;
    }
    if (!here) {
      toast.info(t('You are outside the map area, so the map shows the campus.'));
      api.current?.fitPins();
      return;
    }
    centred.current = true;
    followed.current = `${here.lat},${here.lng}`; // the fly-in is not cut short by a follow pan
    api.current?.flyTo([here.lat, here.lng], followZoom());
  };

  // 3D to 2D: the 3D map first eases back to flat and north up, then the flat map takes over at that view.
  const toggleView = async () => {
    if (switching.current) return;
    if (view === '2d') {
      setSwitchView('3d');
      setView('3d');
      return;
    }
    switching.current = true;
    setSwitchView('2d');
    try {
      await api.current?.flatten?.();
    } finally {
      switching.current = false;
    }
    setView('2d');
  };

  // No WebGL, no network or a blocked map style: the student is told and keeps a working map.
  const fail = useCallback(() => {
    toast.info(t('The 3D map could not be loaded, so the flat map is shown.'));
    setSwitchView('2d');
    setView('2d');
  }, [toast]);

  const props = {
    checkpoints,
    selectedId,
    onSelect,
    route,
    me,
    heading,
    base,
    camera,
    mayFitPins,
    onReady,
    onUserMove,
  };
  return (
    <>
      {view === '2d' ? (
        <MapView2D {...props} />
      ) : (
        <Suspense fallback={<div className="map" />}>
          <MapView3D {...props} onCamera={setTurn} onFail={fail} />
        </Suspense>
      )}
      <MapControls
        view={view}
        switchView={switchView}
        onToggleView={toggleView}
        base={base}
        onBase={setBase}
        camera={turn}
        map={api}
      />
      <RecenterButton following={following && Boolean(here)} onClick={recenter} />
    </>
  );
}
