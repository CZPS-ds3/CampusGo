import L from 'leaflet';
import { useEffect, useRef } from 'react';

const TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; OpenStreetMap contributors';
// The default tiles are light; a CSS filter turns them into the dark map. Set VITE_MAP_DARKEN=false for tiles that are already dark.
const DARKEN = import.meta.env.VITE_MAP_DARKEN !== 'false';

const stateOf = (checkpoint) => {
  if (checkpoint.completed) return 'done';
  return checkpoint.isActive ? 'open' : 'closed';
};

const pinIcon = (checkpoint, selected) =>
  L.divIcon({
    className: 'pin-wrap',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<span class="pin pin--${stateOf(checkpoint)}${selected ? ' is-selected' : ''}"></span>`,
  });

/**
 * Leaflet map with one round pin per checkpoint. Pins are plain circles: red = open, mint = done, grey = closed.
 * The map owns no data; the page passes checkpoints and the selected id.
 */
export function MapView({ checkpoints, selectedId, onSelect }) {
  const container = useRef(null);
  const map = useRef(null);
  const markers = useRef(new Map());
  const fitted = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    map.current = L.map(container.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([49.1233, 9.2108], 17);
    L.tileLayer(TILE_URL, {
      attribution: ATTRIBUTION,
      maxZoom: 19,
      subdomains: 'abcd',
      crossOrigin: true,
    }).addTo(map.current);
    L.control.zoom({ position: 'topright' }).addTo(map.current);
    const markerStore = markers.current;
    return () => {
      map.current.remove();
      map.current = null;
      markerStore.clear();
      fitted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
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
        marker.on('click', () => onSelectRef.current(checkpoint.id));
        markers.current.set(checkpoint.id, marker);
      } else {
        marker.setIcon(pinIcon(checkpoint, selected));
      }
    }
    if (!fitted.current && checkpoints.length > 0) {
      // Keep every pin clear of the checkpoint panel: it is a side panel on wide screens, a bottom card on phones.
      const wide = window.innerWidth >= 1024;
      map.current.fitBounds(L.latLngBounds(checkpoints.map((c) => [c.latitude, c.longitude])), {
        paddingTopLeft: [wide ? 420 : 40, 96],
        paddingBottomRight: [40, wide ? 40 : Math.round(window.innerHeight * 0.5)],
        maxZoom: 18,
      });
      fitted.current = true;
    }
  }, [checkpoints, selectedId]);

  useEffect(() => {
    const checkpoint = checkpoints.find((c) => c.id === selectedId);
    if (checkpoint && map.current)
      map.current.panTo([checkpoint.latitude, checkpoint.longitude], { animate: true });
  }, [selectedId, checkpoints]);

  return (
    <div
      ref={container}
      className={`map${DARKEN ? ' map--darken' : ''}`}
      role="region"
      aria-label="Campus map"
    />
  );
}
