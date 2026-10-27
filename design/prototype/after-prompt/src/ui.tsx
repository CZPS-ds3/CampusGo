import { useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import type { AvatarT } from "./data";
import { t } from "./i18n";

const ICONS = {
  map: "M3 6 9 4 15 6 21 4V18L15 20 9 18 3 20ZM9 4V18M15 6V20",
  quests: "M5 21V3M5 4H19L16 8.5 19 13H5",
  team: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M17 4.5a3.2 3.2 0 0 1 0 6M18.5 14.5c2 .6 3.5 2.4 3.5 5.5",
  ranks: "M7 4H17V10A5 5 0 0 1 7 10ZM7 6H3V8A3 3 0 0 0 7 11M17 6H21V8A3 3 0 0 1 17 11M12 15V19M8 21H16",
  profile: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM3.5 21c0-4.5 3.5-7 8.5-7s8.5 2.5 8.5 7",
  check: "M4 12.5 9.5 18 20 6",
  lock: "M5 11H19V21H5ZM8 11V7a4 4 0 0 1 8 0V11",
  close: "M5 5 19 19M19 5 5 19",
  chevron: "M9 4 17 12 9 20",
  back: "M20 12H5M11 5 4 12 11 19",
  arrow: "M4 12H19M13 5 20 12 13 19",
  clock: "M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 7V12L16 14",
  pin: "M12 22S5 14.5 5 9.5a7 7 0 0 1 14 0C19 14.5 12 22 12 22ZM9.5 9.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0",
  upload: "M12 16V4M6 10 12 4 18 10M4 20H20",
  mail: "M3 5H21V19H3ZM3 6 12 13 21 6",
  refresh: "M20 11A8 8 0 0 0 5 8M4 4V9H9M4 13A8 8 0 0 0 19 16M20 20V15H15",
  bolt: "M13 2 4 14H11L10 22 20 9H13Z",
  gps: "M6 12a6 6 0 1 0 12 0 6 6 0 1 0-12 0M12 2V6M12 18V22M2 12H6M18 12H22",
  warn: "M12 3 22 20H2ZM12 9V14M12 17.2V17.4",
  plus: "M12 4V20M4 12H20",
  compass: "M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5Z",
  logout: "M10 4H4V20H10M9 12H21M16 7 21 12 16 17",
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 24, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

const PRESETS = [
  { bg: "#E2001A", hair: "M13.5 20C14 10 34 10 34.5 20Z" },
  { bg: "#5B6770", hair: "M13 21 15 11 20 15 24 9 28 15 33 11 35 21Z" },
  { bg: "#137A4E", hair: "M13 31V20C13 10 35 10 35 20V31H31V20H17V31Z" },
  { bg: "#B04E00", hair: "M13 21C13 9 35 9 35 21C30 15 18 15 13 21Z" },
  { bg: "#1D2327", hair: "M12 22 14 12 34 12 36 22 33 17H15Z" },
  { bg: "#9AA3AB", hair: "M13 24V18C13 8 35 8 35 18V24C32 14 16 14 13 24Z" },
];
export const PRESET_COUNT = PRESETS.length;

export function Avatar({ avatar, size = 40, label = t("Avatar") }: { avatar: AvatarT; size?: number; label?: string }) {
  const border = size >= 80 ? 4 : 3;
  if (avatar.kind === "img") {
    return <img src={avatar.url} alt={label} width={size} height={size} className="shrink-0 rounded-full object-cover bg-surface2" style={{ width: size, height: size, border: `${border}px solid var(--surface)` }} />;
  }
  const p = PRESETS[avatar.i % PRESETS.length];
  return (
    <span className="block shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size, border: `${border}px solid var(--surface)`, background: p.bg }} role="img" aria-label={label}>
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

export function Display({ as: Tag = "h2", size = "h2", className = "", children }: { as?: "h1" | "h2" | "h3" | "div" | "span"; size?: "h1" | "h2" | "h3"; className?: string; children: ReactNode }) {
  return <Tag className={`display ${size} m-0 ${className}`}>{children}</Tag>;
}

type Variant = "red" | "yellow" | "cyan" | "mint" | "paper" | "ghost";
export function Button({ variant = "red", small, className = "", children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }) {
  return (
    <button type="button" {...p} className={`btn btn-${variant} ${small ? "btn-sm" : ""} ${className}`}>
      {children}
    </button>
  );
}

export function IconButton({ icon, label, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button type="button" aria-label={label} {...p} className={`icon-btn ${p.className ?? ""}`}>
      <Icon name={icon} />
    </button>
  );
}

const TONES: Record<string, string> = {
  red: "var(--signal)",
  yellow: "var(--accent)",
  cyan: "var(--sub)",
  mint: "var(--ok)",
  paper: "var(--fg)",
  danger: "var(--warn)",
};
export function Chip({ tone = "paper", children, icon }: { tone?: keyof typeof TONES | "mute"; children: ReactNode; icon?: IconName }) {
  const mute = tone === "mute";
  return (
    <span className="chip" style={mute ? { background: "var(--surface2)", color: "var(--mute)", borderColor: "var(--line)" } : tone === "red" ? { background: TONES.red, color: "var(--on-signal)" } : tone === "paper" ? { background: "var(--surface2)", color: "var(--fg)" } : { background: TONES[tone] }}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function SlantPanel({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`overflow-hidden rounded-[14px] border border-line bg-surface text-fg ${className}`} style={{ boxShadow: "var(--shadow)", borderLeft: "6px solid var(--signal)" }}>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-[60] flex items-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="scrim" onClick={onClose} />
      <div className="sheet relative w-full rounded-t-3xl border-x border-t border-line bg-surface text-fg px-5 pt-3" style={{ paddingBottom: 34 }}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line2" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

export function Modal({ open, title, children }: { open: boolean; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center px-5" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="scrim" />
      <div className="card anim-pop relative w-full">{children}</div>
    </div>
  );
}

export function Input({ label, error, hint, className = "", ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="caption mb-2 block text-mute">
        {label}
      </label>
      <input id={id} {...p} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-d` : undefined} className={`field ${error ? "field-error" : ""}`} />
      {(error || hint) && (
        <p id={`${id}-d`} role={error ? "alert" : undefined} className={`small mt-2 flex items-start gap-2 ${error ? "text-warn" : "text-mute"}`}>
          {error && <Icon name="warn" size={18} className="mt-0.5" />}
          <span>{error || hint}</span>
        </p>
      )}
    </div>
  );
}

export function OTPBox({ value, index, active, shake, refCb, ...p }: { value: string; index: number; active?: boolean; shake?: boolean; refCb: (el: HTMLInputElement | null) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value">) {
  return (
    <input
      ref={refCb}
      value={value}
      inputMode="numeric"
      autoComplete={index === 0 ? "one-time-code" : "off"}
      aria-label={t("Digit {n} of 6", { n: index + 1 })}
      className={`otp ${value ? "otp-filled" : ""} ${shake ? "anim-shake" : ""} ${active ? "" : ""}`}
      {...p}
    />
  );
}

export function Pin({ x, y, label, state, onClick }: { x: number; y: number; label: string; state: "far" | "range" | "done" | "city"; onClick: () => void }) {
  const fill = state === "done" ? "var(--ok)" : state === "range" ? "var(--sub)" : "var(--surface2)";
  const edge = state === "far" || state === "city" ? "var(--mute)" : "var(--fg)";
  const dim = state === "far" || state === "city";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}, ${state === "done" ? t("completed") : state === "range" ? t("in range") : state === "city" ? t("coming soon") : t("out of range")}`}
      className="absolute flex min-h-12 min-w-12 -translate-x-1/2 -translate-y-1/2 flex-col items-center border-0 bg-transparent p-0"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span className="relative block h-9 w-9">
        {state === "range" && <span className="pin-ring" aria-hidden="true" />}
        <span className="absolute inset-0 flex rotate-45 items-center justify-center" style={{ background: fill, border: `2px solid ${edge}`, boxShadow: "var(--shadow)" }}>
          <span className={`-rotate-45 ${dim ? "text-mute" : "text-on"}`}>
            <Icon name={state === "done" ? "check" : state === "far" || state === "city" ? "lock" : "pin"} size={18} />
          </span>
        </span>
      </span>
      <span
        className="mt-2 max-w-[140px] rounded-md border px-1.5 py-0.5 text-center text-[0.8125rem] font-bold leading-[1.1] shadow-sm"
        style={{ background: "var(--surface)", borderColor: dim ? "var(--mute)" : "var(--fg)", color: dim ? "var(--mute)" : "var(--fg)" }}
      >
        {label}
      </span>
    </button>
  );
}

export function Logo({ height = 56, className = "" }: { height?: number; className?: string }) {
  return (
    <span className={`logo-wrap ${className}`}>
      <img src="/dhbw-logo.png" alt="DHBW Duale Hochschule Baden-Württemberg" style={{ height, width: "auto" }} />
    </span>
  );
}

export function Toast({ msg, tone }: { msg: string | null; tone: "error" | "ok" }) {
  if (!msg) return null;
  return (
    <div role="status" className="anim-pop absolute left-5 right-5 z-[90] flex items-center gap-3 rounded-xl border-[1.5px] border-line2 px-4 py-3 text-on" style={{ top: 57, background: tone === "error" ? "var(--warn)" : "var(--ok)", boxShadow: "var(--shadow)" }}>
      <Icon name={tone === "error" ? "warn" : "check"} />
      <span className="small font-bold">{msg}</span>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 py-8 text-center" style={{ borderStyle: "dashed" }}>
      <span className="flex min-h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-mute text-mute">
        <Icon name={icon} size={28} />
      </span>
      <Display size="h3">{title}</Display>
      <p className="small m-0 max-w-[260px] text-mute">{body}</p>
      {action}
    </div>
  );
}

export function useLongPress(cb: () => void, ms = 650) {
  const t = useRef<number | undefined>(undefined);
  const clear = () => window.clearTimeout(t.current);
  return {
    onPointerDown: () => {
      clear();
      t.current = window.setTimeout(cb, ms);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
  };
}

const HEX = "polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)";
export function GoBadge({ size, icon = "compass" }: { size: number; icon?: IconName }) {
  return (
    <span className="block" style={{ width: size, height: size, filter: "drop-shadow(0 3px 6px rgba(0,0,0,.28))" }} aria-hidden="true">
      <span className="flex h-full w-full items-center justify-center bg-surface p-[3px]" style={{ clipPath: HEX }}>
        <span className="flex h-full w-full items-center justify-center bg-signal text-white" style={{ clipPath: HEX }}>
          <Icon name={icon} size={Math.round(size * 0.42)} />
        </span>
      </span>
    </span>
  );
}

export function QuestBall({ open, shrunk, hidden, spin, onToggle }: { open: boolean; shrunk: boolean; hidden: boolean; spin: number; onToggle: () => void }) {
  return (
    <button type="button" aria-label={open ? t("Close menu") : t("Open menu")} aria-expanded={open} onClick={onToggle} className={`ball ${hidden ? "ball-hidden" : shrunk && !open ? "ball-small" : ""}`} tabIndex={hidden ? -1 : 0}>
      <span key={spin} className={`block ${spin ? "anim-spin" : ""}`}>
        <GoBadge size={72} icon={open ? "close" : "compass"} />
      </span>
    </button>
  );
}

export type Section = "map" | "quests" | "team" | "ranks" | "profile";
const BARS: { id: Section; label: string; icon: IconName }[] = [
  { id: "map", label: "Map", icon: "map" },
  { id: "quests", label: "Quests", icon: "quests" },
  { id: "team", label: "Team", icon: "team" },
  { id: "ranks", label: "Ranks", icon: "ranks" },
  { id: "profile", label: "Profile", icon: "profile" },
];

export function Menu({ current, closing, onPick, onClose }: { current: Section; closing: boolean; onPick: (s: Section) => void; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-[65]" role="menu" aria-label={t("Main menu")}>
      <div className={`scrim ${closing ? "scrim-out" : ""}`} onClick={onClose} />
      <div className="absolute inset-x-5 flex flex-col gap-2" style={{ bottom: 150 }}>
        {BARS.map((b, i) => {
          const here = b.id === current;
          return (
            <div key={b.id} className={`bar-wrap ${closing ? "bar-out" : ""}`} style={{ animationDelay: `${closing ? i * 20 : (4 - i) * 50}ms` }}>
              <button type="button" role="menuitem" aria-current={here ? "page" : undefined} className="bar" onClick={() => onPick(b.id)} style={{ background: here ? "var(--signal)" : "var(--surface)", color: here ? "var(--on-signal)" : "var(--fg)" }}>
                <Icon name={b.icon} size={26} />
                <span className="flex-1 text-left">{t(b.label)}</span>
                {here && <span className="caption">{t("You are here")}</span>}
                <Icon name="chevron" size={20} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Page({ children, className = "", pb = 140 }: { children: ReactNode; className?: string; pb?: number }) {
  return (
    <main className={`absolute inset-0 overflow-y-auto px-5 ${className}`} style={{ paddingTop: 67, paddingBottom: pb }}>
      {children}
    </main>
  );
}

const LANGS = [
  { id: "de", label: "DE", name: "Deutsch" },
  { id: "en", label: "EN", name: "English" },
] as const;

/** Compact language switch used on screens that appear before sign-in. */
export function LangSwitch({ lang, onChange }: { lang: string; onChange: (l: "de" | "en") => void }) {
  return (
    <div className="seg grid-cols-2" role="radiogroup" aria-label={t("Language")} style={{ width: "fit-content" }}>
      {LANGS.map((l) => (
        <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} aria-label={l.name} onClick={() => onChange(l.id)} style={{ minWidth: 44 }}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
