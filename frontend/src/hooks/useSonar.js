import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createRangeWatch, pingDelayMs, pingPin, ringReachM, sizeSonar } from '../map-pins.js';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The sonar range ring under the ball, shared by the flat and the 3D map. Keeps the ring as wide on screen as the real
 * unlock range (call the returned `resize` from the map's zoom handler) and flashes a quest's pin once each time it
 * comes into range, when the sonar wave reaches it. Whether the sonar and the flash are on comes from the map style
 * (data-sonar and data-sonar-ping on the page, BR48). Display only: the server still decides on unlocking (BR12).
 *
 * `container` is the map's element ref, `zoomNow()` the map's zoom in Leaflet's numbers (null before the map exists),
 * `pinElement(id)` the element of a quest's pin, `pinsReady` false while the map cannot draw its pins yet.
 */
export function useSonar({ container, zoomNow, me, checkpoints, pinElement, pinsReady = true }) {
  const ringM = useMemo(() => ringReachM(checkpoints), [checkpoints]);
  const latest = useRef({});
  latest.current = { zoomNow, me, ringM, pinElement };
  const watch = useRef(createRangeWatch());

  const resize = useCallback(() => {
    const { zoomNow: zoomOf, me: here, ringM: reachM } = latest.current;
    const zoom = zoomOf();
    if (zoom === null || !here) return;
    sizeSonar(container.current, { reachM, lat: here.lat, zoom });
  }, [container]);

  const lat = me?.lat;
  const lng = me?.lng;
  useEffect(() => resize(), [resize, lat, ringM]);

  useEffect(() => {
    if (lat === undefined || !pinsReady) return undefined;
    // One frame later: the map's own effects add the pins for new quests after this hook's effects have run.
    const frame = requestAnimationFrame(() => {
      const pinOf = (id) => latest.current.pinElement(id);
      const entered = watch.current.update({ lat, lng }, checkpoints, (id) => Boolean(pinOf(id)));
      const page = document.documentElement.dataset;
      if (page.sonarPing !== 'on' || reducedMotion()) return;
      for (const { id, metres } of entered) {
        pingPin(pinOf(id), pingDelayMs(metres, ringM, page.sonarSpeed));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [lat, lng, checkpoints, ringM, pinsReady]);

  return resize;
}
