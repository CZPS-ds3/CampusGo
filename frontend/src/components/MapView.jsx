import L from 'leaflet';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useNight } from '../daylight.js';
import { canDrawWebGl } from '../device.js';
import { insideMapArea } from '../geo.js';
import { useSonar } from '../hooks/useSonar.js';
import { useToast } from '../hooks/useToast.jsx';
import { getMapBase, getMapView, t, useSettings } from '../i18n.js';
import { STYLE_URLS, fetchBaseStyle, isDark } from '../map-3d.js';
import { MAX_ZOOM, createBaseLayers } from '../map-layers.js';
import {
  FOLLOW_LOW,
  FOLLOW_ZOOM,
  createFollower,
  GLIDE_SECONDS,
  GROUND_SIZE,
  PIN_ANCHOR,
  PIN_SIZE,
  PUCK_ANCHOR,
  PUCK_SIZE,
  groundHtml,
  metresPerPixel,
  pinHtml,
  puckHtml,
  rollBall,
  scalePuck,
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
const FLIGHT_LIMIT_MS = 5000;

// Worse than this (metres), the phone is sharing only an approximate location.
const APPROXIMATE_M = 100;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/** The zoom of the following view: on a phone as close as the map goes, on a larger screen FOLLOW_ZOOM. */
const followZoom = () =>
  window.matchMedia?.('(max-width: 767px)').matches ? MAX_ZOOM : FOLLOW_ZOOM;

// MapLibre is large, so it is downloaded apart from the app, when the map opens. If the download fails, the stand-in
// reports it and the page shows the Leaflet map instead.
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
 * The fallback map (Leaflet), flat and north up, for browsers without WebGL or when MapLibre cannot load: one
 * diamond pin per checkpoint (ringed = open, green tick = done, padlock = closed), the walking route and the live
 * position. The buttons live outside the map (MapControls); this component hands them a small camera API through
 * `onReady`. `camera` is shared with the MapLibre map, so a switch keeps place and zoom.
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
  const night = useNight();
  const resizeSonar = useSonar({
    container,
    zoomNow: () => map.current?.getZoom() ?? null,
    me,
    checkpoints,
    pinElement: (id) => markers.current.get(id)?.getElement(),
  });
  const latest = useRef({});
  latest.current = {
    onSelect,
    onReady,
    onUserMove,
    mayFitPins,
    checkpoints,
    heading,
    me,
    resizeSonar,
  };

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
    // The live position shrinks and fades as the map zooms out; the sonar ring keeps the real unlock range.
    const scale = () => {
      scalePuck(container.current, instance.getZoom());
      latest.current.resizeSonar();
    };
    instance.on('zoom', scale);
    scale();
    save();
    instance.on('dragstart', () => latest.current.onUserMove());
    // While following, the map's middle is a little above the visitor, so the ball sits low in the middle.
    const followCentre = (point, zoom = instance.getZoom()) =>
      instance.unproject(
        instance.project(point, zoom).subtract(L.point(0, instance.getSize().y * FOLLOW_LOW)),
        zoom,
      );
    // Resolves when the flight ends (or is stopped by a drag), so following does not cut it short.
    const fly = (point, zoom) =>
      new Promise((resolve) => {
        if (reducedMotion()) {
          instance.setView(followCentre(point, zoom), zoom);
          resolve();
          return;
        }
        instance.flyTo(followCentre(point, zoom), zoom, { duration: 1.2, easeLinearity: 0.2 });
        // Listened for only now: the flight first stops a follow pan that is still running, and the "moveend" of
        // that pan must not count as the end of the flight (the next pan would cut the flight short).
        instance.once('moveend', resolve);
        setTimeout(resolve, FLIGHT_LIMIT_MS); // never leave following waiting
      });
    latest.current.onReady({
      zoomIn: () => instance.zoomIn(),
      zoomOut: () => instance.zoomOut(),
      north: () => undefined,
      flyTo: fly,
      // About as long as the ball takes to reach a new reading, so a walking visitor stays in the middle.
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
      puck.current?.follower.stop();
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
  // on top. Both follow the position every frame (walking on between readings), and the ball rolls the way it moved.
  const lat = me?.lat;
  const lng = me?.lng;
  useEffect(() => {
    if (lat === undefined) {
      puck.current?.follower.stop();
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
      const ground = marker(
        groundHtml(latest.current.heading),
        [GROUND_SIZE, GROUND_SIZE],
        [GROUND_SIZE / 2, GROUND_SIZE / 2],
        -1000,
      );
      const ball = marker(puckHtml(), PUCK_SIZE, PUCK_ANCHOR, 1000);
      const follower = createFollower(point, (at, east, north) => {
        if (!map.current) return;
        ground.setLatLng(at);
        ball.setLatLng(at);
        const px = metresPerPixel(at[0], map.current.getZoom());
        rollBall(ball.getElement(), east / px, north / px);
      });
      puck.current = { ground, ball, follower };
      return;
    }
    puck.current.follower.moveTo(point, latest.current.me?.velocity);
  }, [lat, lng]);

  // The direction changes in place, so a compass reading never interrupts the ball's movement.
  useEffect(() => {
    if (!puck.current) return;
    updateGround(puck.current.ground.getElement(), heading);
  }, [heading, lat]);

  return (
    <div
      ref={container}
      className={`map${DARKEN ? ' map--darken' : ''}${night ? ' map--night' : ''}`}
      role="region"
      aria-label={t('Campus map')}
    />
  );
}

/**
 * The campus map. It starts in 2D (flat, turnable) or 3D (tilted with buildings), and with the aerial photo or the
 * street map, as chosen in the preferences; the buttons switch both without moving the camera. MapLibre draws both
 * views; the Leaflet map stands in, flat and north up, where MapLibre cannot run. With the live location on, the
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
  const mapStyle = useMapStyle();
  const { theme } = useSettings();
  const [view, setView] = useState(getMapView);
  // 'gl' (MapLibre, 2D and 3D) or 'leaflet' (the flat fallback). A 3D preference always tries MapLibre.
  const [engine, setEngine] = useState(() =>
    getMapView() === '3d' || canDrawWebGl() ? 'gl' : 'leaflet',
  );
  // Phones can share only an approximate location (iOS "Precise Location", Android "Use precise location" turned
  // off for the browser): the page cannot change that, so it says once how to turn it on.
  const coarse = (me?.accuracy ?? 0) > APPROXIMATE_M;
  const toldCoarse = useRef(false);
  useEffect(() => {
    if (!coarse || toldCoarse.current) return;
    toldCoarse.current = true;
    toast.info(
      t(
        'Your phone only shares an approximate location (about {m} m). For your exact spot, turn on precise location for this browser in the phone settings.',
        { m: Math.round(latest.current.meAccuracy) },
      ),
    );
  }, [coarse, toast]);
  const [base, setBase] = useState(getMapBase);
  const [following, setFollowing] = useState(true);
  // Flat and north up until MapLibre reports its real turn and tilt.
  const [turn, setTurn] = useState({ bearing: 0, pitch: 0 });
  const [mapVersion, setMapVersion] = useState(0);
  const api = useRef(null);
  const camera = useRef(null);
  const centred = useRef(false);
  const followed = useRef('');
  // True while the map flies in to the visitor: a new reading then waits instead of cutting the flight short with a
  // pan (the flight ended somewhere in between, and Re-center seemed not to work).
  const flying = useRef(false);
  // Where a 2D/3D switch should end: the following view, when the map is in it at the switch; otherwise null.
  const switchTo = useRef(null);
  const here = me && insideMapArea([me.lat, me.lng]) ? me : null;
  const latest = useRef({});
  latest.current = { following, here, route, meAccuracy: me?.accuracy, view };

  const onReady = useCallback((value) => {
    api.current = value;
    if (value) setMapVersion((n) => n + 1);
  }, []);
  const onUserMove = useCallback(() => setFollowing(false), []);
  const mayFitPins = useCallback(() => !(latest.current.following && latest.current.here), []);

  /** Flies in to `point` in the following view; readings that arrive meanwhile wait until it has landed. */
  const flyIn = useCallback((point) => {
    const flight = api.current?.flyTo(point, followZoom());
    if (!flight) return;
    flying.current = true;
    flight.then(() => {
      flying.current = false;
    });
  }, []);

  // Following: the first position flies in close, later ones pan gently. The 2D/3D switch animation itself ends in
  // the other map's following view (see toggleView), so nothing moves again after it.
  const hereLat = here?.lat;
  const hereLng = here?.lng;
  useEffect(() => {
    if (!api.current || !following || hereLat === undefined) return;
    const point = [hereLat, hereLng];
    const key = point.join(',');
    if (centred.current) {
      if (followed.current === key || flying.current) return;
      api.current.panTo(point);
    } else {
      centred.current = true;
      flyIn(point);
    }
    followed.current = key;
  }, [hereLat, hereLng, following, mapVersion, flyIn]);

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
    followed.current = `${here.lat},${here.lng}`;
    flyIn([here.lat, here.lng]);
  };

  // 2D and 3D are one MapLibre map that eases between flat and tilted; from the Leaflet fallback, 3D tries MapLibre
  // again.
  // The street-map style downloads while MapLibre itself is still loading, not after it: the map shows sooner. A
  // failed download is reported by the map itself, which asks again.
  const styleUrl = STYLE_URLS[isDark(mapStyle, theme) ? 'dark' : 'light'];
  useEffect(() => {
    if (engine === 'gl') fetchBaseStyle(styleUrl).catch(() => undefined);
  }, [engine, styleUrl]);

  const toggleView = () => {
    // In the following view (following, still at its zoom) the switch goes in one move to the other view's following
    // tilt; away from it the switch keeps the place and zoom.
    const inFollowView =
      following && here && Math.abs((camera.current?.zoom ?? 0) - followZoom()) < 0.5;
    switchTo.current = inFollowView ? { point: [here.lat, here.lng], zoom: followZoom() } : null;
    const next = view === '2d' ? '3d' : '2d';
    setView(next);
    if (next === '3d') setEngine('gl');
  };

  // No WebGL, no network or a blocked map style: the student is told and keeps a working map.
  const fail = useCallback(() => {
    toast.info(
      latest.current.view === '3d'
        ? t('The 3D map could not be loaded, so the flat map is shown.')
        : t('The turnable map could not be loaded, so a simpler flat map is shown.'),
    );
    setEngine('leaflet');
    setView('2d');
    setTurn({ bearing: 0, pitch: 0 });
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
      {engine === 'leaflet' ? (
        <MapView2D {...props} />
      ) : (
        <Suspense fallback={<div className="map" />}>
          <MapView3D
            {...props}
            flat={view === '2d'}
            switchTo={switchTo}
            onCamera={setTurn}
            onFail={fail}
          />
        </Suspense>
      )}
      <MapControls
        view={view}
        turnable={engine === 'gl'}
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
