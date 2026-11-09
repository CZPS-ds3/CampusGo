// Small colour helpers for the map style: parsing what a student types, and contrast for readable pin icons.
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;

/** "#abc", "#aabbcc" or "rgb(1, 2, 3)" as { r, g, b }; null when it is none of them or a channel is above 255. */
export function parseColor(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (HEX.test(text)) {
    let digits = text.slice(1);
    if (digits.length === 3) digits = [...digits].map((d) => d + d).join('');
    const n = Number.parseInt(digits, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const match = RGB.exec(text);
  if (!match) return null;
  const [r, g, b] = match.slice(1).map(Number);
  return r <= 255 && g <= 255 && b <= 255 ? { r, g, b } : null;
}

const byte = (n) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');

export const toHex = ({ r, g, b }) => `#${byte(r)}${byte(g)}${byte(b)}`;

/** Normalised "#rrggbb", or null. */
export function normalizeColor(value) {
  const rgb = parseColor(value);
  return rgb ? toHex(rgb) : null;
}

function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrastRatio(a, b) {
  const la = luminance(parseColor(a));
  const lb = luminance(parseColor(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** White or near-black, whichever is easier to read on this background (used for pin icons). */
export function readableOn(background) {
  return contrastRatio(background, '#ffffff') >= contrastRatio(background, '#14181c')
    ? '#ffffff'
    : '#14181c';
}
