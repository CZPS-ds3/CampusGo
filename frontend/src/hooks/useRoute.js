import { useCallback, useRef, useState } from 'react';

const ROUTING_URL = (
  import.meta.env.VITE_ROUTING_URL || 'https://routing.openstreetmap.de/routed-foot'
).replace(/\/$/, '');
const TIMEOUT_MS = 8000;

/** Asks the browser for one position. The result stays in the browser: it is never sent to our server. */
const currentPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve([coords.latitude, coords.longitude]),
      (error) => reject(error),
      // A fresh, precise fix, so the route starts where the visitor really is.
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });

/** Walking route from the OpenStreetMap foot router as a list of [lat, lng] points. */
export async function fetchWalkingRoute(from, to, signal) {
  const path = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  const response = await fetch(
    `${ROUTING_URL}/route/v1/foot/${path}?overview=full&geometries=geojson`,
    { signal },
  );
  if (!response.ok) throw new Error('router');
  const data = await response.json();
  const route = data.routes?.[0];
  if (!route) throw new Error('no route');
  return {
    points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    meters: Math.round(route.distance),
    seconds: Math.round(route.duration),
    straight: false,
  };
}

const IDLE = { status: 'idle', route: null, from: null, target: null };

/**
 * Route helper for the map. `status` is idle, locating, routing, ready, denied or error. When the router is
 * not reachable a straight line is drawn instead, so the visitor still sees the direction. `shown` counts the
 * routes the visitor asked for (not the new ones after a wrong turn), so the map zooms out only for those.
 */
export function useRoute() {
  const [state, setState] = useState(IDLE);
  const [shown, setShown] = useState(0);
  const controller = useRef(null);
  const target = useRef(null);

  const clear = useCallback(() => {
    controller.current?.abort();
    target.current = null;
    setState(IDLE);
  }, []);

  /** Draws the route to `to`. `known` is the live position when the map already has one (no second request). */
  const show = useCallback(async (to, known = null) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    target.current = to;
    setState({ ...IDLE, status: 'locating', target: to });
    let from = known;
    if (!from) {
      try {
        from = await currentPosition();
      } catch (error) {
        setState({ ...IDLE, status: error?.code === 1 ? 'denied' : 'error', target: to });
        return;
      }
    }
    setState({ ...IDLE, status: 'routing', from, target: to });
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const route = await fetchWalkingRoute(from, to, abort.signal);
      setState({ status: 'ready', route, from, target: to });
    } catch {
      if (controller.current !== abort) return;
      setState({
        status: 'ready',
        from,
        target: to,
        route: { points: [from, to], meters: null, seconds: null, straight: true },
      });
    } finally {
      clearTimeout(timer);
      if (controller.current === abort) setShown((n) => n + 1);
    }
  }, []);

  /** After a wrong turn: a new route from where the visitor is now. The old one stays if the router fails. */
  const reroute = useCallback(async (from) => {
    const to = target.current;
    if (!to) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const route = await fetchWalkingRoute(from, to, abort.signal);
      if (controller.current === abort) setState({ status: 'ready', route, from, target: to });
    } catch {
      // The router is busy or offline: the visitor keeps the route they had, which still leads there.
    } finally {
      clearTimeout(timer);
    }
  }, []);

  return { ...state, shown, show, clear, reroute };
}
