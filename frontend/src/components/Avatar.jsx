import { t } from '../i18n.js';

// Six drawn player cards: a coloured ground, a head and one hairstyle each.
const PRESETS = [
  { bg: '#E2001A', hair: 'M13.5 20C14 10 34 10 34.5 20Z' },
  { bg: '#5B6770', hair: 'M13 21 15 11 20 15 24 9 28 15 33 11 35 21Z' },
  { bg: '#137A4E', hair: 'M13 31V20C13 10 35 10 35 20V31H31V20H17V31Z' },
  { bg: '#B04E00', hair: 'M13 21C13 9 35 9 35 21C30 15 18 15 13 21Z' },
  { bg: '#1D2327', hair: 'M12 22 14 12 34 12 36 22 33 17H15Z' },
  { bg: '#9AA3AB', hair: 'M13 24V18C13 8 35 8 35 18V24C32 14 16 14 13 24Z' },
];
export const PRESET_COUNT = PRESETS.length;

/**
 * Round picture. Shows the uploaded picture when there is one, else the chosen preset, else the first letter.
 * `avatar` is { url?, preset? }; the name is only used for the fallback letter.
 */
export function Avatar({ avatar = {}, name = '?', size = 40, label }) {
  const border = size >= 80 ? 4 : 3;
  const style = { width: size, height: size, borderWidth: border };
  const alt = label ?? t('Avatar');
  if (avatar.url) {
    return (
      <span className="avatar" style={style} role="img" aria-label={alt}>
        <img src={avatar.url} alt="" />
      </span>
    );
  }
  if (Number.isInteger(avatar.preset)) {
    const p = PRESETS[avatar.preset % PRESETS.length];
    return (
      <span className="avatar" style={{ ...style, background: p.bg }} role="img" aria-label={alt}>
        <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">
          <path d="M6 50C6 36 42 36 42 50Z" fill="#E8EAEC" stroke="#1D2327" strokeWidth="2.5" />
          <circle cx="24" cy="23" r="10" fill="#F2F3F4" stroke="#1D2327" strokeWidth="2.5" />
          <path d={p.hair} fill="#1D2327" />
          <rect x="19" y="23" width="2.5" height="4" fill="#1D2327" />
          <rect x="26.5" y="23" width="2.5" height="4" fill="#1D2327" />
          <path d="M20.5 29H27.5" stroke="#1D2327" strokeWidth="2" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="avatar avatar--letter"
      style={{ ...style, fontSize: size * 0.45 }}
      role="img"
      aria-label={alt}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
