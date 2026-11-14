import { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../i18n.js';
import { STYLE_URLS, buildStyle, fetchBaseStyle, isDark, toGlZoom } from '../map-3d.js';
import { PREVIEW_CENTRE, PREVIEW_ZOOM } from '../map-layers.js';
import { useMapStyle } from '../mapStyle.js';

/**
 * The street-map preview in the preferences, drawn by MapLibre exactly like the 2D map: flat, in the student's
 * colours, light or dark. It cannot be moved, and it shows as much ground as the aerial picture beside it. Where the
 * map cannot be drawn it shows `fallback`, the picture of the street map that the Leaflet fallback uses.
 */
export default function StreetPreview({ fallback }) {
  const box = useRef(null);
  const map = useRef(null);
  const [failed, setFailed] = useState(false);
  const mapStyle = useMapStyle();
  const { theme } = useSettings();
  const dark = isDark(mapStyle, theme);

  useEffect(() => {
    let live = true;
    fetchBaseStyle(STYLE_URLS[dark ? 'dark' : 'light']).then(
      (baseStyle) => {
        if (!live) return;
        const style = buildStyle(baseStyle, { mapStyle, dark, base: 'street', flat: true });
        if (map.current) {
          map.current.setStyle(style, { diff: true });
          return;
        }
        try {
          // One street tile (256 px) of ground across the preview, as in the aerial picture.
          const width = box.current.clientWidth || 256;
          map.current = new MapLibreMap({
            container: box.current,
            style,
            center: [PREVIEW_CENTRE.lng, PREVIEW_CENTRE.lat],
            zoom: toGlZoom(PREVIEW_ZOOM + Math.log2(width / 256)),
            interactive: false,
            attributionControl: false,
          });
        } catch {
          setFailed(true);
        }
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [mapStyle, dark]);

  // The map holds a WebGL context; it is given back when the preferences close.
  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    [],
  );

  // The picture lies underneath until the live map has drawn over it, so the preview is never an empty box.
  return (
    <span className="mappick__stack">
      <img className="mappick__img" src={fallback} alt="" loading="lazy" />
      {!failed && (
        <span ref={box} className="mappick__img mappick__live" data-testid="street-preview" />
      )}
    </span>
  );
}
