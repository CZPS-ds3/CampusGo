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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
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

/**
 * Route helper for the map. `status` is idle, locating, routing, ready, denied or error. When the router is
 * not reachable a straight line is drawn instead, so the visitor still sees the direction.
 */
export function useRoute() {
  const [state, setState] = useState({ status: 'idle', route: null, from: null });
  const controller = useRef(null);

  const clear = useCallback(() => {
    controller.current?.abort();
    setState({ status: 'idle', route: null, from: null });
  }, []);

  const show = useCallback(async (target) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState({ status: 'locating', route: null, from: null });
    let from;
    try {
      from = await currentPosition();
    } catch (error) {
      setState({ status: error?.code === 1 ? 'denied' : 'error', route: null, from: null });
      return;
    }
    setState({ status: 'routing', route: null, from });
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const route = await fetchWalkingRoute(from, target, abort.signal);
      setState({ status: 'ready', route, from });
    } catch {
      if (controller.current !== abort) return;
      setState({
        status: 'ready',
        from,
        route: { points: [from, target], meters: null, seconds: null, straight: true },
      });
    } finally {
      clearTimeout(timer);
    }
  }, []);

  return { ...state, show, clear };
}
