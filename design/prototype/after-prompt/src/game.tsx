import { useEffect, useRef, useState } from "react";
import { Avatar, Button, Chip, Display, Icon, IconButton, Page, Pin, SlantPanel, useLongPress } from "./ui";
import { t } from "./i18n";
import { CITY, CPS, fmt, mmss, type AvatarT, type CP, type Prog } from "./data";

export type LocMode = "success" | "weak" | "denied";

const BLOCKS = [
  "M112 222H178V262H150V338H112Z", "M222 222 288 232V338H222Z", "M112 382H178V498H112Z", "M222 382H288V440H250V498H222Z", "M22 222H68V338H22Z", "M332 382H368V498H332Z", "M22 542H68V658H22Z", "M222 542H288V658H240Z", "M332 222H368V338H332Z", "M22 382H68V498H22Z", "M112 542H178V658H112Z", "M332 542H368V658H332Z", "M22 100H68V178H22Z", "M112 90H178V178H112Z", "M222 110H288V178H222Z", "M332 100H368V178H332Z", "M222 702H288V822H222Z", "M332 702H368V822H332Z", "M22 702H68V822H22Z",
];

function MapArt() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 390 844" preserveAspectRatio="none" aria-hidden="true">
      <rect width="390" height="844" style={{ fill: "var(--map-bg)" }} />
      {[90, 200, 310].map((x) => (
        <line key={x} x1={x} y1="0" x2={x} y2="844" strokeWidth="14" vectorEffect="non-scaling-stroke" style={{ stroke: "var(--map-road)" }} />
      ))}
      {[200, 360, 520, 680].map((y) => (
        <line key={y} x1="0" y1={y} x2="390" y2={y} strokeWidth="14" vectorEffect="non-scaling-stroke" style={{ stroke: "var(--map-road)" }} />
      ))}
      {BLOCKS.map((d, i) => (
        <path key={i} d={d} strokeWidth="1.5" vectorEffect="non-scaling-stroke" style={{ fill: "var(--map-block)", stroke: "var(--map-edge)" }} />
      ))}
      <path d="M112 702H178V822H112Z" strokeWidth="2" strokeDasharray="8 6" vectorEffect="non-scaling-stroke" style={{ fill: "color-mix(in srgb, var(--ok) 22%, transparent)", stroke: "var(--ok)" }} />
    </svg>
  );
}

export function MapHome({ nick, avatar, points, rank, progress, onPin, onProfile, onCity }: { nick: string; avatar: AvatarT; points: number; rank: number; progress: Record<string, Prog>; onPin: (id: string) => void; onProfile: () => void; onCity: () => void }) {
  const [zone, setZone] = useState<"campus" | "city">("campus");
  return (
    <div className="absolute inset-0">
      <div className={`absolute inset-0 ${zone === "city" ? "grayscale" : ""}`}>
        <MapArt />
        <div className="halftone absolute inset-0 opacity-40" aria-hidden="true" />
        {zone === "campus" ? (
          <>
            <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: "35%", top: "52%" }} aria-label={t("Your position")}>
              <span className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-full bg-sub/40" style={{ clipPath: "polygon(50% 100%, 0 0, 100% 0)", transform: "translate(-50%,-92%) rotate(30deg)", transformOrigin: "50% 100%" }} aria-hidden="true" />
              <span className="relative block rounded-full" style={{ boxShadow: "0 0 0 4px var(--signal), var(--shadow)" }}>
                <Avatar avatar={avatar} size={36} label={t("You")} />
              </span>
            </div>
            {CPS.map((c) => {
              const p = progress[c.id];
              const state = p.cleared ? "done" : c.dist <= 50 ? "range" : "far";
              return <Pin key={c.id} x={c.x} y={c.y} label={c.name} state={state} onClick={() => onPin(c.id)} />;
            })}
          </>
        ) : (
          CITY.map((c) => <Pin key={c.id} x={c.x} y={c.y} label={c.name} state="city" onClick={onCity} />)
        )}
      </div>
      {zone === "city" && (
        <div className="anim-pop absolute left-5 right-5" style={{ top: 330 }}>
          <SlantPanel>
            <div className="flex items-center gap-3">
              <Icon name="lock" size={32} />
              <div>
                <Display as="div" size="h2">{t("Coming soon")}</Display>
                <p className="small m-0 font-medium text-mute">{t("City zones open after the campus quests.")}</p>
              </div>
            </div>
          </SlantPanel>
        </div>
      )}

      <div className="absolute inset-x-5 z-10" style={{ top: 47 }}>
        <div className="card flex items-center gap-3 !p-3">
          <button type="button" onClick={onProfile} aria-label={t("Open profile")} className="rounded-full border-0 bg-transparent p-0">
            <Avatar avatar={avatar} size={44} label={t("Your avatar")} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate font-bold leading-5">{nick}</p>
            <p className="mono m-0 text-[1.25rem] leading-6 text-accent">{fmt(points)} <span className="caption text-mute">{t("PTS")}</span></p>
          </div>
          <Chip tone="cyan">{t("Rank")} #{rank}</Chip>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2" role="tablist" aria-label={t("Map zone")}>
          <button type="button" role="tab" aria-selected={zone === "campus"} onClick={() => setZone("campus")} className="display h3 flex min-h-12 items-center justify-center rounded-xl px-1 !text-[0.9375rem] border-[1.5px] border-line" style={{ background: zone === "campus" ? "var(--signal)" : "var(--surface)", color: zone === "campus" ? "var(--on-signal)" : "var(--fg)", boxShadow: "var(--shadow)", transform: "none" }}>
            {t("Campus")}
          </button>
          <button type="button" role="tab" aria-selected={zone === "city"} onClick={() => setZone("city")} className="display h3 flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-1 !text-[0.9375rem] border-[1.5px] border-mute" style={{ background: zone === "city" ? "var(--surface2)" : "var(--surface)", color: "var(--mute)", boxShadow: "var(--shadow)", transform: "none" }}>
            <Icon name="lock" size={18} /> {t("City zones")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Locate({ cp, mode, onCycle, onSuccess, onBack }: { cp: CP; mode: LocMode; onCycle: () => void; onSuccess: () => void; onBack: () => void }) {
  const [phase, setPhase] = useState<"scan" | LocMode>("scan");
  const [run, setRun] = useState(0);
  useEffect(() => {
    setPhase("scan");
    const t = setTimeout(() => {
      setPhase(mode);
      if (mode === "success") setTimeout(onSuccess, 900);
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, mode]);
  const dev = useLongPress(onCycle, 600);
  const copy = {
    scan: { t: t("Scanning…"), b: t("Hold still while we find you."), c: "var(--sub)" },
    success: { t: t("Locked on!"), b: t("You are at {name}.", { name: t(cp.name) }), c: "var(--ok)" },
    weak: { t: t("Weak signal"), b: t("GPS signal weak — try again. No attempt used."), c: "var(--warn)" },
    denied: { t: t("Location is off"), b: t("Campus & City Quest needs your location to check that you are at the spot. Turn it on in your browser settings, then check again."), c: "var(--warn)" },
  }[phase];
  return (
    <Page className="flex flex-col">
      <div className="flex items-center gap-3">
        <IconButton icon="back" label={t("Back to map")} onClick={onBack} />
        <div {...dev} className="select-none">
          <Display as="h1" size="h2">{t("Location check")}</Display>
        </div>
      </div>
      <p className="small mt-2 text-mute">{t(cp.name)} · {t("timer starts only after the quiz begins")}</p>
      <div className="relative mx-auto mt-8 flex h-[260px] w-[260px] items-center justify-center">
        {[0, 1, 2].map((i) => (
          <span key={i} className="absolute rounded-full border-[1.5px]" style={{ inset: i * 40, borderColor: phase === "success" ? "var(--ok)" : phase === "scan" ? "var(--surface2)" : "var(--warn)" }} aria-hidden="true" />
        ))}
        {phase === "scan" && <span className="radar-sweep absolute inset-0 rounded-full" aria-hidden="true" />}
        <span className={`relative flex h-16 w-16 items-center justify-center rounded-full border-[1.5px] border-line2 ${phase === "success" ? "anim-pop" : ""}`} style={{ background: copy.c, color: "#fff", boxShadow: "var(--shadow)" }}>
          <Icon name={phase === "success" ? "check" : phase === "scan" ? "gps" : "warn"} size={32} />
        </span>
      </div>
      <div className="mt-8 text-center" aria-live="polite">
        <Display as="h2" size="h2" className="" >{copy.t}</Display>
        <p className="mx-auto mt-2 max-w-[300px] text-mute">{copy.b}</p>
      </div>
      <div className="mt-6">
        {phase === "weak" && <Button variant="yellow" onClick={() => setRun((r) => r + 1)}><Icon name="refresh" /> {t("Try again")}</Button>}
        {phase === "denied" && <Button variant="cyan" onClick={() => setRun((r) => r + 1)}><Icon name="gps" /> {t("Check again")}</Button>}
      </div>
    </Page>
  );
}

export function Info({ cp, onReady, onBack }: { cp: CP; onReady: () => void; onBack: () => void }) {
  return (
    <Page>
      <div className="flex items-center gap-3">
        <IconButton icon="back" label={t("Back to map")} onClick={onBack} />
        <Chip tone="mint" icon="check">{t("Location verified")}</Chip>
      </div>
      <Display as="h1" size="h1" className="mt-5 block">{t(cp.name)}</Display>
      <p className="mt-2 text-mute">{t("Read these first. No timer is running yet.")}</p>
      <ol className="m-0 mt-6 flex list-none flex-col gap-3 p-0">
        {cp.facts.map((f, i) => (
          <li key={i} className="card flex gap-4">
            <span className="display h2 text-accent" style={{ transform: "none" }}>{i + 1}</span>
            <p className="m-0 min-w-0 flex-1">{t(f)}</p>
          </li>
        ))}
      </ol>
      <div className="card mt-3 flex items-center justify-between bg-surface2">
        <span className="caption min-w-0 text-mute">{cp.count} {t("questions")} · {t("pass")} {cp.pass}/{cp.count}</span>
        <span className="mono text-sub">{mmss(cp.count * 60)}</span>
      </div>
      <Button variant="red" className="mt-6" onClick={onReady}>{t("I'm ready")} <Icon name="arrow" /></Button>
    </Page>
  );
}

export type QuizOut = { results: boolean[]; hard: boolean; timeLeft: number; timeUp: boolean };

export function Quiz({ cp, attempt, onDone }: { cp: CP; attempt: number; onDone: (o: QuizOut) => void }) {
  const total = cp.count;
  const [i, setI] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [hard, setHard] = useState(false);
  const [offer, setOffer] = useState(false);
  const [time, setTime] = useState(total * 60);
  const done = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setTime((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (time <= 0 && !done.current) {
      done.current = true;
      onDone({ results, hard, timeLeft: 0, timeUp: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time]);

  const isHardNow = hard && i === total - 1;
  const cur = isHardNow && cp.hard ? cp.hard : cp.qs[i];
  const pick = (idx: number) => {
    if (sel !== null) return;
    setSel(idx);
    setResults((r) => [...r, idx === cur.a]);
  };
  const next = () => {
    if (i === total - 1) {
      done.current = true;
      onDone({ results, hard, timeLeft: time, timeUp: false });
      return;
    }
    setSel(null);
    const ni = i + 1;
    if (ni === total - 1 && attempt === 1 && total === 5 && cp.hard && results.every(Boolean)) {
      setI(ni);
      setOffer(true);
    } else setI(ni);
  };

  const danger = time < 30;
  const letters = ["A", "B", "C", "D"];
  const correct = sel !== null && sel === cur.a;

  if (offer)
    return (
      <div className="absolute inset-0 flex flex-col justify-center px-5">
        <div className="halftone absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="anim-pop relative">
          <Chip tone="yellow" icon="bolt">{t("Perfect so far")}</Chip>
          <Display as="h1" size="h1" className="mt-4 block text-accent">{t("Bonus")}<br />{t("round")}</Display>
          <p className="mt-4">{t("Q1–4 all correct on your first try. Swap Q5 for one hard question worth")} <b className="mono text-accent">{fmt(2000)}</b>.</p>
          <p className="small text-mute">{t("Timer keeps running. One shot, no retry.")}</p>
          <Button variant="yellow" className="mt-6" onClick={() => { setHard(true); setOffer(false); }}>
            {t("Accept bonus")} <Icon name="bolt" />
          </Button>
          <Button variant="ghost" className="mt-3" onClick={() => setOffer(false)}>{t("Decline, normal Q5")}</Button>
        </div>
      </div>
    );

  return (
    <div className="absolute inset-0 flex flex-col px-5" style={{ paddingTop: 57, paddingBottom: 34 }}>
      <div className="flex items-center gap-3">
        <IconButton icon="back" label={t("Back (disabled during quiz)")} disabled />
        <span className="display h3 flex-1">{t("Q")} {i + 1}/{total}</span>
        <div className={`mono flex min-h-12 items-center gap-2 rounded-xl border-[1.5px] px-3 text-[1.25rem] ${time < 10 ? "timer-pulse" : ""}`} style={{ borderColor: danger ? "var(--warn)" : "var(--fg)", color: danger ? "var(--warn)" : "var(--fg)", background: "var(--surface)" }} role="timer" aria-label={t("Time left {time}", { time: mmss(time) })}>
          <Icon name="clock" size={20} />{mmss(time)}
        </div>
      </div>
      <div className="mt-2 flex gap-1.5" aria-hidden="true">
        {Array.from({ length: total }).map((_, k) => (
          <span key={k} className="h-2 flex-1 rounded-sm" style={{ background: k < results.length ? (results[k] ? "var(--ok)" : "var(--warn)") : k === i ? "var(--fg)" : "var(--surface2)" }} />
        ))}
      </div>
      <div key={i} className="anim-pop mt-5">
        <SlantPanel>
          {isHardNow && <p className="caption m-0 mb-2 text-accent">{t("Bonus · worth 2,000")}</p>}
          <h2 className="m-0 text-[1.375rem] font-bold leading-[1.3]">{t(cur.q)}</h2>
        </SlantPanel>
      </div>
      <div className="relative mt-5 flex flex-col gap-3">
        {sel !== null && correct && (
          <span className="anim-float mono pointer-events-none absolute -top-2 right-2 z-10 text-[1.75rem] text-ok">+{isHardNow ? "2000" : "1000"}</span>
        )}
        {cur.o.map((o, k) => {
          const isCorrect = k === cur.a;
          const isSel = k === sel;
          let bg = "var(--surface)", col = "var(--fg)", bd = "var(--line2)";
          if (sel !== null) {
            if (isCorrect) { bg = "var(--ok)"; col = "var(--on)"; }
            else if (isSel) { bg = "var(--warn)"; col = "var(--on)"; }
            else { col = "var(--mute)"; bd = "var(--line)"; }
          }
          return (
            <button key={k} type="button" disabled={sel !== null} onClick={() => pick(k)} className={`flex min-h-16 items-center gap-3 rounded-xl border-[1.5px] px-3 py-2 text-left font-medium ${isSel && !isCorrect ? "anim-shake" : ""}`} style={{ background: bg, color: col, borderColor: bd, boxShadow: sel === null ? "var(--shadow)" : "none", transition: "background 120ms" }}>
              <span className="display h3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface2 text-fg" style={{ padding: 0 }}>{letters[k]}</span>
              <span className="min-w-0 flex-1">{t(o)}</span>
              {sel !== null && isCorrect && <Icon name="check" />}
            </button>
          );
        })}
      </div>
      <div className="mt-auto pt-4">
        {sel !== null && (
          <Button variant="cyan" className="anim-pop" onClick={next}>
            {i === total - 1 ? t("Finish") : t("Next")} <Icon name="arrow" />
          </Button>
        )}
      </div>
    </div>
  );
}

export type ResultData = {
  cp: CP; attempt: number; pass: boolean; timeUp: boolean; correct: number; base: number; timeBonus: number; fullClear: number; mult: number; total: number; awarded: number; rankBefore: number; rankAfter: number; alreadyCleared: boolean;
};

function useCount(target: number, ms = 1200) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const s = performance.now();
    let raf = 0;
    const tick = (n: number) => {
      const p = Math.min(1, (n - s) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function Result({ r, onRetry, onMap, onQuests }: { r: ResultData; onRetry: () => void; onMap: () => void; onQuests: () => void }) {
  const shown = useCount(r.pass ? r.awarded || r.total : 0);
  if (!r.pass)
    return (
      <Page>
        <Chip tone="danger" icon="warn">{r.timeUp ? t("Time is up") : t("Not this time")}</Chip>
        <Display as="h1" size="h1" className="mt-4 block">{t("Almost there")}</Display>
        <p className="mt-3 text-mute">{r.timeUp ? t("The timer ran out.") : t("You got {c} of {n} right. You need {p}.", { c: r.correct, n: r.cp.count, p: r.cp.pass })} {t("You can try this checkpoint again.")}</p>
        <div className="card mt-6 flex items-center justify-between">
          <div>
            <p className="caption text-mute">{t("Attempt used")}</p>
            <p className="mono m-0 text-[2.5rem] leading-[2.75rem]">{r.attempt}</p>
          </div>
          <div className="text-right">
            <p className="caption text-mute">{t("Next attempt pays")}</p>
            <p className="mono m-0 text-[1.75rem] leading-[2rem] text-accent">{r.attempt >= 5 ? "0%" : `${[100, 85, 70, 55, 40][r.attempt]}%`}</p>
          </div>
        </div>
        {r.attempt >= 5 && <p className="small mt-3 text-warn">{t("From attempt 6 on, a checkpoint earns 0 points.")}</p>}
        <div className="mt-6 flex flex-col gap-3">
          <Button variant="yellow" onClick={onRetry}><Icon name="refresh" /> {t("Try again")}</Button>
          <Button variant="ghost" onClick={onMap}>{t("Back to map")}</Button>
        </div>
      </Page>
    );
  const rows: [string, string][] = [
    [t("Correct answers ({c}/{n})", { c: r.correct, n: r.cp.count }), fmt(r.base)],
    [t("Time bonus"), `+${fmt(r.timeBonus)}`],
    [t("Full clear"), r.fullClear ? `+${r.fullClear}` : "–"],
    [t("Attempt {n} multiplier", { n: r.attempt }), `×${Math.round(r.mult * 100)}%`],
  ];
  return (
    <Page>
      <div className="relative">
        <Chip tone="mint" icon="check">{t("Pass")} {r.correct}/{r.cp.count}</Chip>
        <Display as="h1" size="h1" className="mt-4 block">{t(r.cp.name)}</Display>
        
      </div>
      <div className="mt-6 text-center">
        <div className="anim-pop mb-3 inline-flex items-center gap-2 rounded-full border border-ok px-3 py-1 text-ok" style={{ animationDelay: "500ms" }}><Icon name="check" size={16} /><span className="caption">{t("Checkpoint cleared")}</span></div>
        <p className="caption text-mute">{r.alreadyCleared ? t("Already cleared · no new points") : t("Points earned")}</p>
        <p className="mono m-0 text-[4rem] leading-[4.25rem] text-accent">{r.alreadyCleared ? "0" : fmt(shown)}</p>
      </div>
      <div className="card mt-4 !p-0">
        {rows.map(([a, b], k) => (
          <div key={a} className="flex items-center justify-between px-4 py-3" style={{ borderTop: k ? "1px solid var(--line)" : 0, animation: `countBar 400ms ${200 + k * 120}ms both` }}>
            <span className="small min-w-0 text-mute">{a}</span>
            <span className="mono">{b}</span>
          </div>
        ))}
        <div className="flex items-center justify-between rounded-b-[12px] bg-signal px-4 py-3 text-white">
          <span className="caption">{t("Total (rounded up)")}</span>
          <span className="mono text-[1.25rem]">{fmt(r.total)}</span>
        </div>
      </div>
      <div className="card anim-pop mt-3 flex items-center justify-between bg-surface2" style={{ animationDelay: "900ms" }}>
        <span className="caption text-mute">{t("Rank up")}</span>
        <span className="mono flex items-center gap-3 text-[1.25rem]">
          <span className="text-mute">#{r.rankBefore}</span><Icon name="arrow" size={20} className="text-sub" /><span className="text-sub">#{r.rankAfter}</span>
        </span>
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <Button variant="red" onClick={onMap}>{t("Back to map")}</Button>
        <Button variant="ghost" onClick={onQuests}>{t("See quests")}</Button>
      </div>
    </Page>
  );
}
