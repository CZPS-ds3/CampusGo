// Authored inline icons, one stroke style. Decorative unless a `title` is given.
const paths = {
  map: 'M3 6 9 4 15 6 21 4V18L15 20 9 18 3 20ZM9 4V18M15 6V20',
  quests: 'M5 21V3M5 4H19L16 8.5 19 13H5',
  team: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M17 4.5a3.2 3.2 0 0 1 0 6M18.5 14.5c2 .6 3.5 2.4 3.5 5.5',
  ranks:
    'M7 4H17V10A5 5 0 0 1 7 10ZM7 6H3V8A3 3 0 0 0 7 11M17 6H21V8A3 3 0 0 1 17 11M12 15V19M8 21H16',
  profile: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM3.5 21c0-4.5 3.5-7 8.5-7s8.5 2.5 8.5 7',
  check: 'M4 12.5 9.5 18 20 6',
  lock: 'M5 11H19V21H5ZM8 11V7a4 4 0 0 1 8 0V11',
  close: 'M5 5 19 19M19 5 5 19',
  chevron: 'M9 4 17 12 9 20',
  back: 'M20 12H5M11 5 4 12 11 19',
  arrow: 'M4 12H19M13 5 20 12 13 19',
  clock: 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 7V12L16 14',
  pin: 'M12 22S5 14.5 5 9.5a7 7 0 0 1 14 0C19 14.5 12 22 12 22ZM9.5 9.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0',
  upload: 'M12 16V4M6 10 12 4 18 10M4 20H20',
  mail: 'M3 5H21V19H3ZM3 6 12 13 21 6',
  refresh: 'M20 11A8 8 0 0 0 5 8M4 4V9H9M4 13A8 8 0 0 0 19 16M20 20V15H15',
  bolt: 'M13 2 4 14H11L10 22 20 9H13Z',
  gps: 'M6 12a6 6 0 1 0 12 0 6 6 0 1 0-12 0M12 2V6M12 18V22M2 12H6M18 12H22',
  warn: 'M12 3 22 20H2ZM12 9V14M12 17.2V17.4',
  plus: 'M12 4V20M4 12H20',
  compass: 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5Z',
  logout: 'M10 4H4V20H10M9 12H21M16 7 21 12 16 17',
  wifiOff:
    'M3 3l18 18M5 9.5a10 10 0 0 1 4-2.3M19 9.5a10 10 0 0 0-5-2.6M8.5 13a5.5 5.5 0 0 1 2-1.2M15.5 13a5.5 5.5 0 0 0-1.6-1.1M12 17.5v.01',
  admin: 'M12 3 4 6V12C4 16.5 7.5 20 12 21c4.5-1 8-4.5 8-9V6ZM9 12l2 2 4-4',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
};

export function Icon({ name, size = 24, title, className = '' }) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function IconButton({ icon, label, className = '', ...rest }) {
  return (
    <button type="button" aria-label={label} className={`icon-btn ${className}`.trim()} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

const HEX = 'polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)';

/** The round-ish "GO" badge: a red hexagon with a white rim, used as the menu button. */
export function GoBadge({ size, icon = 'compass' }) {
  return (
    <span
      className="gobadge"
      style={{ width: size, height: size, filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.28))' }}
      aria-hidden="true"
    >
      <span className="gobadge__rim" style={{ clipPath: HEX }}>
        <span className="gobadge__core" style={{ clipPath: HEX }}>
          <Icon name={icon} size={Math.round(size * 0.42)} />
        </span>
      </span>
    </span>
  );
}
