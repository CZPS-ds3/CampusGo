// Authored inline icons, one stroke style (2px, round). Decorative by default; pass `title` to label one.
const paths = {
  map: 'M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7zM9 4v13M15 7v13',
  quests: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  team: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5 6.5-5s5.9 1.6 6.5 5M17 4.5a3.2 3.2 0 0 1 0 6M18 15c2 .5 3.2 2 3.5 5',
  ranks: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 20h8',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c.8-3.8 3.7-5.5 7.5-5.5s6.7 1.7 7.5 5.5',
  bars: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  clock: 'M12 21a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 8v4.5l3 1.5',
  alarm: 'M12 21a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM12 9v4l2.5 1.5M4 6l3-2.5M20 6l-3-2.5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cross: 'M6 6l12 12M18 6 6 18',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  locate: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  wifiOff:
    'M3 3l18 18M5 9.5a10 10 0 0 1 4-2.3M19 9.5a10 10 0 0 0-5-2.6M8.5 13a5.5 5.5 0 0 1 2-1.2M15.5 13a5.5 5.5 0 0 0-1.6-1.1M12 17.5v.01',
  warn: 'M12 4 2.5 20h19zM12 10v4.5M12 17.5v.01',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  flag: 'M6 21V4M6 5h12l-2.5 4 2.5 4H6',
};

export function Icon({ name, title, className = '' }) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      viewBox="0 0 24 24"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
