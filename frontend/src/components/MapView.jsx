import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { t } from '../i18n.js';

const TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; OpenStreetMap contributors';
// The default tiles are light; in the dark theme a CSS filter darkens them (VITE_MAP_DARKEN=false for tiles that are dark already).
const DARKEN = import.meta.env.VITE_MAP_DARKEN !== 'false';
// The map may not leave the Heilbronn area (a few kilometres around the Bildungscampus).
const CAMPUS_CENTER = [49.1485, 9.2165];
const MAX_BOUNDS = L.latLngBounds([49.12, 9.17], [49.18, 9.26]);
const MIN_ZOOM = 14;

const stateOf = (checkpoint) => {
  if (checkpoint.completed) return 'done';
  return checkpoint.isActive ? 'open' : 'closed';
};

const PIN_ICON = {
  done: 'M4 12.5 9.5 18 20 6',
  open: 'M12 22S5 14.5 5 9.5a7 7 0 0 1 14 0C19 14.5 12 22 12 22ZM9.5 9.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0',
  closed: 'M5 11H19V21H5ZM8 11V7a4 4 0 0 1 8 0V11',
};

function pinHtml(checkpoint, selected) {
  const state = stateOf(checkpoint);
  const ring = state === 'open' ? '<span class="pin__ring"></span>' : '';
  const name = checkpoint.name.replace(/[&<>"]/g, '');
  return `<span class="pin pin--${state}${selected ? ' is-selected' : ''}">
    <span class="pin__shape">${ring}<span class="pin__diamond"><svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${PIN_ICON[state]}"/></svg></span></span>
    <span class="pin__label">${name}</span>
  </span>`;
}

const pinIcon = (checkpoint, selected) =>
  L.divIcon({
    className: 'pin-wrap',
    iconSize: [140, 70],
    iconAnchor: [70, 22],
    html: pinHtml(checkpoint, selected),
  });

/**
 * Leaflet map with one diamond pin per checkpoint: ringed = open, green tick = done, padlock = closed.
 * The map owns no data; the page passes checkpoints and the selected id.
 */
export function MapView({ checkpoints, selectedId, onSelect, route = null, from = null }) {
  const container = useRef(null);
  const map = useRef(null);
  const markers = useRef(new Map());
  const fitted = useRef(false);
  const routeLayer = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    map.current = L.map(container.current, {
      zoomControl: false,
      attributionControl: true,
      minZoom: MIN_ZOOM,
      maxBounds: MAX_BOUNDS,
      maxBoundsViscosity: 1,
    }).setView(CAMPUS_CENTER, 17);
    L.tileLayer(TILE_URL, {
      attribution: ATTRIBUTION,
      minZoom: MIN_ZOOM,
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
      routeLayer.current = null;
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
      // Leave room for the player card at the top and the GO badge at the bottom.
      map.current.fitBounds(L.latLngBounds(checkpoints.map((c) => [c.latitude, c.longitude])), {
        paddingTopLeft: [60, 190],
        paddingBottomRight: [60, 150],
        maxZoom: 18,
      });
      fitted.current = true;
    }
  }, [checkpoints, selectedId]);

  // The walking route and the visitor's own position (kept only in the browser).
  useEffect(() => {
    if (!map.current) return undefined;
    routeLayer.current?.remove();
    routeLayer.current = null;
    if (!route) return undefined;
    const group = L.layerGroup();
    L.polyline(route.points, {
      color: '#e2001a',
      weight: 5,
      opacity: 0.9,
      dashArray: route.straight ? '2 10' : undefined,
      lineCap: 'round',
    }).addTo(group);
    if (from) {
      L.circleMarker(from, {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#1d6fe0',
        fillOpacity: 1,
        interactive: false,
      }).addTo(group);
    }
    group.addTo(map.current);
    routeLayer.current = group;
    map.current.fitBounds(L.latLngBounds(route.points), {
      paddingTopLeft: [50, 200],
      paddingBottomRight: [50, 150],
      maxZoom: 18,
    });
    return () => {
      group.remove();
    };
  }, [route, from]);

  return (
    <div
      ref={container}
      className={`map${DARKEN ? ' map--darken' : ''}`}
      role="region"
      aria-label={t('Campus map')}
    />
  );
}
