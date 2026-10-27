import { useCallback, useEffect, useRef, useState } from "react";
import { Login, Otp, Signup, Splash, type Profile } from "./auth";
import { Info, Locate, MapHome, Quiz, Result, type LocMode, type QuizOut, type ResultData } from "./game";
import { NotFound, ProfileScreen, Quests, Ranks, Team, initialInvites, type Invite, type TeamT } from "./social";
import { ATTEMPT_MULT, CPS, fmt, initialProg, totalPoints, youRank, type Prog } from "./data";
import { t, useSettings } from "./i18n";
import { Button, Chip, Display, Icon, Menu, QuestBall, Sheet, Toast, type Section } from "./ui";

type Route = "splash" | "login" | "otp" | "signup" | "map" | "locate" | "info" | "quiz" | "result" | "quests" | "team" | "ranks" | "profile" | "notfound";

const NO_BALL: Route[] = ["splash", "login", "otp", "signup", "quiz"];
const SECTION: Record<Route, Section> = { splash: "map", login: "map", otp: "map", signup: "map", map: "map", locate: "map", info: "map", quiz: "map", result: "map", notfound: "map", quests: "quests", team: "team", ranks: "ranks", profile: "profile" };
const MODES: LocMode[] = ["success", "weak", "denied"];
const MODE_LABEL: Record<LocMode, string> = { success: "GPS success", weak: "weak signal", denied: "permission denied" };

function useViewport() {
  const [v, setV] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const f = () => setV({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return v;
}

const nameFromEmail = (e: string) => {
  const [a, b = "student"] = e.split("@")[0].split(".");
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return { first: cap(a), last: cap(b) };
};

export default function App() {
  useSettings(); // re-render the whole tree when language, theme or font size changes
  const frameRef = useRef<HTMLDivElement>(null);
  const { w, h } = useViewport();
  const [route, setRoute] = useState<Route>("splash");
  const [wipe, setWipe] = useState(0);
  const [email, setEmail] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [profile, setProfile] = useState<Profile>({ first: "Anna", last: "Keller", nick: "AnnaGO", avatar: { kind: "preset", i: 2 } });
  const [progress, setProgress] = useState<Record<string, Prog>>(initialProg);
  const [team, setTeam] = useState<TeamT | null>(null);
  const [invites, setInvites] = useState<Invite[]>(initialInvites);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState(CPS[0].id);
  const [result, setResult] = useState<ResultData | null>(null);
  const [locMode, setLocMode] = useState<LocMode>("success");
  const [toast, setToast] = useState<{ msg: string; tone: "error" | "ok" } | null>(null);
  const [menu, setMenu] = useState<"closed" | "open" | "closing">("closed");
  const [spin, setSpin] = useState(0);
  const [shrunk, setShrunk] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string, tone: "error" | "ok" = "ok") => {
    window.clearTimeout(toastTimer.current);
    setToast({ msg, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const go = (r: Route) => {
    setWipe((n) => n + 1);
    setMenu("closed");
    window.setTimeout(() => {
      setRoute(r);
      setShrunk(false);
    }, 150);
  };

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const last = new WeakMap<EventTarget, number>();
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement;
      const y = t.scrollTop ?? 0;
      const p = last.get(t) ?? 0;
      if (y > p + 4) setShrunk(true);
      else if (y < p - 4) setShrunk(false);
      last.set(t, y);
    };
    el.addEventListener("scroll", onScroll, true);
    return () => el.removeEventListener("scroll", onScroll, true);
  }, []);

  const points = totalPoints(progress);
  const rank = youRank(points);
  const displayName = profile.nick || `${profile.first} ${profile.last.charAt(0)}.`;
  const fullName = `${profile.first} ${profile.last}`;
  const cp = CPS.find((c) => c.id === activeId)!;
  const sheetCp = CPS.find((c) => c.id === sheetId) ?? null;

  const toggleMenu = () => {
    setSpin((s) => s + 1);
    if (menu === "open") {
      setMenu("closing");
      window.setTimeout(() => setMenu("closed"), 260);
    } else if (menu === "closed") setMenu("open");
  };
  const pickSection = (s: Section) => {
    if (s === SECTION[route] && ["map", "quests", "team", "ranks", "profile"].includes(route)) {
      setMenu("closing");
      window.setTimeout(() => setMenu("closed"), 260);
      return;
    }
    go(s);
  };

  const startQuest = (id: string) => {
    setSheetId(null);
    setActiveId(id);
    go("locate");
  };

  const finishQuiz = (o: QuizOut) => {
    const p = progress[cp.id];
    const attempt = p.attempts + 1;
    const correct = o.results.filter(Boolean).length;
    const base = o.results.reduce((s, ok, k) => s + (ok ? (o.hard && k === cp.count - 1 ? 2000 : 1000) : 0), 0);
    const pass = !o.timeUp && correct >= cp.pass;
    const fullClear = correct === cp.count ? 200 : 0;
    const mult = attempt >= 6 ? 0 : ATTEMPT_MULT[attempt - 1];
    const total = pass ? Math.ceil((base + o.timeLeft + fullClear) * mult) : 0;
    const awarded = pass && !p.cleared ? total : 0;
    setResult({ cp, attempt, pass, timeUp: o.timeUp, correct, base, timeBonus: o.timeLeft, fullClear, mult, total, awarded, rankBefore: youRank(points), rankAfter: youRank(points + awarded), alreadyCleared: p.cleared });
    setProgress((prev) => ({ ...prev, [cp.id]: { attempts: attempt, cleared: p.cleared || pass, bestScore: Math.max(p.bestScore, total), awarded: p.awarded + awarded, bestCorrect: Math.max(p.bestCorrect, correct) } }));
    go("result");
  };

  const signOut = () => {
    setEmail("");
    setTeam(null);
    go("login");
  };

  const ballHidden = NO_BALL.includes(route) || !!sheetId;
  const desktop = w >= 520;
  const scale = desktop ? Math.min(1, (h - 56) / (844 + 44 + 6)) : 1;

  const frame = (
    <div ref={frameRef} className={`frame ${desktop ? "frame-desktop" : ""}`} >
      {desktop && <div className="absolute left-1/2 top-2.5 z-[95] -translate-x-1/2 rounded-full bg-black" style={{ width: 112, height: 28 }} aria-hidden="true" />}

      {route === "splash" && <Splash onStart={() => go("login")} />}
      {route === "login" && (
        <Login
          onSend={(e) => {
            setEmail(e);
            setIsNew(e.startsWith("new@"));
            go("otp");
          }}
        />
      )}
      {route === "otp" && (
        <Otp
          email={email}
          toast={showToast}
          onBack={() => go("login")}
          onSuccess={() => {
            if (isNew) go("signup");
            else {
              if (email !== "anna.k@heilbronn.dhbw.de") setProfile((p) => ({ ...p, ...nameFromEmail(email), nick: "" }));
              go("map");
            }
          }}
        />
      )}
      {route === "signup" && (
        <Signup
          email={email}
          onDone={(p) => {
            setProfile(p);
            go("map");
          }}
        />
      )}

      {route === "map" && <MapHome nick={displayName} avatar={profile.avatar} points={points} rank={rank} progress={progress} onPin={setSheetId} onProfile={() => go("profile")} onCity={() => showToast(t("City zones: coming soon"), "ok")} />}
      {route === "locate" && <Locate key={cp.id} cp={cp} mode={locMode} onBack={() => go("map")} onSuccess={() => go("info")} onCycle={() => {
        const n = MODES[(MODES.indexOf(locMode) + 1) % 3];
        setLocMode(n);
        showToast(`Dev: ${t(MODE_LABEL[n])}`, "ok");
      }} />}
      {route === "info" && <Info cp={cp} onBack={() => go("map")} onReady={() => go("quiz")} />}
      {route === "quiz" && <Quiz key={cp.id + progress[cp.id].attempts} cp={cp} attempt={progress[cp.id].attempts + 1} onDone={finishQuiz} />}
      {route === "result" && result && <Result r={result} onRetry={() => go("locate")} onMap={() => go("map")} onQuests={() => go("quests")} />}
      {route === "quests" && <Quests progress={progress} onOpen={setSheetId} />}
      {route === "team" && <Team me={{ name: displayName, avatar: profile.avatar }} team={team} setTeam={setTeam} invites={invites} setInvites={setInvites} toast={showToast} />}
      {route === "ranks" && <Ranks points={points} myName={displayName} team={team} goTeam={() => go("team")} toast={showToast} />}
      {route === "profile" && <ProfileScreen name={fullName} nick={profile.nick} email={email || "anna.k@heilbronn.dhbw.de"} avatar={profile.avatar} points={points} team={team?.name ?? null} cleared={CPS.filter((c) => progress[c.id].cleared).length} onSignOut={signOut} on404={() => go("notfound")} />}
      {route === "notfound" && <NotFound onHome={() => go("map")} />}

      <Sheet open={!!sheetCp} onClose={() => setSheetId(null)} title={sheetCp ? t("{name} checkpoint", { name: t(sheetCp.name) }) : t("Checkpoint")}>
        {sheetCp && (() => {
          const p = progress[sheetCp.id];
          return (
            <>
              <div className="flex items-start justify-between gap-3">
                <Display as="h2" size="h2" className="min-w-0 flex-1">{t(sheetCp.name)}</Display>
                <Chip tone={p.cleared ? "mint" : sheetCp.dist <= 50 ? "cyan" : "mute"} icon={p.cleared ? "check" : sheetCp.dist <= 50 ? "pin" : "lock"}>
                  {p.cleared ? t("Cleared") : sheetCp.dist <= 50 ? t("In range") : t("Far away")}
                </Chip>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="card !p-3"><p className="caption text-mute">{t("Distance")}</p><p className="mono m-0 text-[1.25rem]">{sheetCp.dist} m</p></div>
                <div className="card !p-3"><p className="caption text-mute">{t("Questions")}</p><p className="mono m-0 text-[1.25rem]">{sheetCp.count}</p></div>
                <div className="card !p-3"><p className="caption text-mute">{t("Pass rule")}</p><p className="mono m-0 text-[1.25rem]">{sheetCp.pass}/{sheetCp.count}</p></div>
                <div className="card !p-3"><p className="caption text-mute">{t("Best score")}</p><p className="mono m-0 text-[1.25rem] text-accent">{p.bestScore ? fmt(p.bestScore) : "–"}</p></div>
              </div>
              <p className="small mt-3 text-mute">{t("Attempts used:")} <b className="mono text-fg">{p.attempts}</b> · {t("Timer starts at the first question.")}</p>
              <Button className="mt-4" variant={p.cleared ? "ghost" : "red"} onClick={() => startQuest(sheetCp.id)}>
                {p.cleared ? t("Replay (no points)") : p.attempts ? t("Retry quest") : t("Start quest")} <Icon name="arrow" />
              </Button>
            </>
          );
        })()}
      </Sheet>

      {menu !== "closed" && <Menu current={SECTION[route]} closing={menu === "closing"} onPick={pickSection} onClose={toggleMenu} />}
      <QuestBall open={menu === "open"} shrunk={shrunk} hidden={ballHidden} spin={spin} onToggle={toggleMenu} />
      <Toast msg={toast?.msg ?? null} tone={toast?.tone ?? "ok"} />
      {wipe > 0 && <div key={wipe} className="wipe" aria-hidden="true" />}
    </div>
  );

  if (!desktop) return frame;
  return (
    <div className="stage">
      <div style={{ width: 396 * scale, height: (844 + 44 + 6) * scale }}>
        <div className="browser" style={{ width: 396, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <div className="flex items-center gap-3 border-b border-line bg-surface2 px-3" style={{ height: 44, fontSize: 13 }} aria-hidden="true">
            <span className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-signal" />
              <span className="h-3 w-3 rounded-full bg-line2" />
              <span className="h-3 w-3 rounded-full bg-line2" />
            </span>
            <span className="flex flex-1 items-center gap-2 rounded-md border border-line bg-surface px-2 text-mute" style={{ height: 28, lineHeight: 1 }}>
              <Icon name="lock" size={12} /> campusgo.dhbw-heilbronn.de
            </span>
          </div>
          {frame}
        </div>
      </div>
    </div>
  );
}
