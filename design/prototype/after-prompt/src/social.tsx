import { useEffect, useRef, useState } from "react";
import { Avatar, Button, Chip, Display, EmptyState, Icon, IconButton, Input, Logo, Modal, Page } from "./ui";
import { FONT_SCALE, setSettings, t, useSettings, type FontSize } from "./i18n";
import { CPS, SOLO, TEAMS, SCHOOL_RE, fmt, ranked, type AvatarT, type Prog, type Row } from "./data";

/* ---------- Quests ---------- */
export function Quests({ progress, onOpen }: { progress: Record<string, Prog>; onOpen: (id: string) => void }) {
  const [f, setF] = useState<"all" | "new" | "retry" | "cleared">("all");
  const status = (id: string) => (progress[id].cleared ? "cleared" : progress[id].attempts > 0 ? "retry" : "new");
  const list = CPS.filter((c) => f === "all" || status(c.id) === f);
  const done = CPS.filter((c) => progress[c.id].cleared).length;
  return (
    <Page>
      <Display as="h1" size="h1" className="block">{t("Quests")}</Display>
      <p className="mono mt-1 text-sub">{done}/{CPS.length} <span className="caption text-mute">{t("cleared")}</span></p>
      <div className="mt-4 grid grid-cols-4 gap-2" role="tablist" aria-label={t("Filter quests")}>
        {(["all", "new", "retry", "cleared"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={f === k} onClick={() => setF(k)} className="caption flex min-h-12 items-center justify-center rounded-xl border px-1" style={{ background: f === k ? "var(--signal)" : "var(--surface)", color: f === k ? "var(--on-signal)" : "var(--fg)", borderColor: f === k ? "var(--signal)" : "var(--line)" }}>
            {t(k)}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {list.length === 0 && <EmptyState icon="quests" title={t("Nothing here")} body={t("No {f} quests right now. Try another filter.", { f: t(f) })} action={<Button small variant="ghost" onClick={() => setF("all")}>{t("Show all")}</Button>} />}
        {list.map((c) => {
          const p = progress[c.id];
          const s = status(c.id);
          return (
            <button key={c.id} type="button" className="card flex items-center gap-3" onClick={() => onOpen(c.id)}>
              <span className="flex min-h-12 w-12 shrink-0 rotate-45 items-center justify-center border-[1.5px] border-line2" style={{ background: s === "cleared" ? "var(--ok)" : s === "retry" ? "var(--warn)" : "var(--sub)", boxShadow: "var(--shadow)", color: "var(--on)" }}>
                <span className="-rotate-45"><Icon name={s === "cleared" ? "check" : "pin"} size={22} /></span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="display h3 block">{t(c.name)}</span>
                <span className="small block text-mute">{c.count} {t("questions")} · {t("pass")} {c.pass}/{c.count}</span>
                <span className="small block text-mute">{t("Attempts used:")} <b className="mono text-fg">{p.attempts}</b></span>
              </span>
              <Chip tone={s === "cleared" ? "mint" : s === "retry" ? "danger" : "cyan"}>{t(s)}</Chip>
            </button>
          );
        })}
      </div>
    </Page>
  );
}

/* ---------- Team ---------- */
export type TeamT = { name: string; avatar?: AvatarT; members: { name: string; you?: boolean; avatar: AvatarT }[]; pending: { email: string; exp: number }[] };
export type Invite = { id: string; team: string; from: string; members: number; expired?: boolean };
export const initialInvites = (): Invite[] => [
  { id: "i1", team: "Night Owls", from: "Jonas W.", members: 4 },
  { id: "i2", team: "Stack Overflowers", from: "Priya S.", members: 5 },
  { id: "i3", team: "Late Lectures", from: "Lena B.", members: 3, expired: true },
];
const IN_TEAM = ["lena.b@heilbronn.dhbw.de", "omar.h@heilbronn.dhbw.de"];
const FAKE: AvatarT[] = [1, 2, 3, 4, 5].map((i) => ({ kind: "preset", i }));
const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
};

export function Team({ me, team, setTeam, invites, setInvites, toast }: { me: { name: string; avatar: AvatarT }; team: TeamT | null; setTeam: (t: TeamT | null) => void; invites: Invite[]; setInvites: (i: Invite[]) => void; toast: (m: string, t?: "error" | "ok") => void }) {
  const [name, setName] = useState("");
  const [nameErr, setNameErr] = useState("");
  const [pic, setPic] = useState<AvatarT | undefined>();
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [, tick] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!team) {
    return (
      <Page>
        <Display as="h1" size="h1" className="block">{t("Team")}</Display>
        <p className="mt-2 text-mute">{t("Teams of 2 to 5 share a rank on the team board.")}</p>
        <form className="card mt-5 flex flex-col gap-4" noValidate onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return setNameErr(t("Team name is required"));
          setNameErr("");
          setTeam({ name: name.trim(), avatar: pic, members: [{ name: me.name, you: true, avatar: me.avatar }], pending: [] });
          toast(t("Team {name} created", { name: name.trim() }), "ok");
        }}>
          <Display as="h2" size="h3">{t("Create team")}</Display>
          <div className="flex items-center gap-3">
            {pic ? <Avatar avatar={pic} size={56} label={t("Team picture")} /> : <span className="flex min-h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-dashed border-mute text-mute"><Icon name="team" /></span>}
            <button type="button" onClick={() => file.current?.click()} className="caption flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-sub text-sub"><Icon name="upload" size={20} /> {t("Picture (optional)")}</button>
            <input ref={file} type="file" accept="image/*" className="hidden" aria-label={t("Upload team picture")} onChange={(e) => { const f = e.target.files?.[0]; if (f) setPic({ kind: "img", url: URL.createObjectURL(f) }); }} />
          </div>
          <Input label={t("Team name *")} value={name} onChange={(e) => setName(e.target.value)} error={nameErr} maxLength={24} />
          <Button type="submit" variant="mint">{t("Create team")}</Button>
        </form>

        <Display as="h2" size="h2" className="mt-8 block">{t("Invitations")}</Display>
        <div className="mt-3 flex flex-col gap-3">
          {invites.length === 0 && <EmptyState icon="mail" title={t("No invites")} body={t("When a team invites you, it shows up here.")} />}
          {invites.map((i) => {
            const full = i.members >= 5;
            return (
              <div key={i.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="display h3 m-0">{i.team}</p>
                    <p className="small m-0 text-mute">{t("From")} {i.from} · {i.members}/5 {t("members")}</p>
                  </div>
                  {i.expired ? <Chip tone="mute">{t("Expired")}</Chip> : full ? <Chip tone="danger">{t("Team full")}</Chip> : <Chip tone="cyan">{t("Open")}</Chip>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Button small variant="mint" disabled={full || i.expired} onClick={() => {
                    setTeam({ name: i.team, members: [...Array.from({ length: i.members }, (_, k) => ({ name: ["Jonas W.", "Aiko T.", "Mira K.", "Diego R."][k] ?? "Teammate", avatar: FAKE[k % 5] })), { name: me.name, you: true, avatar: me.avatar }], pending: [] });
                    setInvites(invites.filter((x) => x.id !== i.id));
                    toast(t("Joined {name}", { name: i.team }), "ok");
                  }}>{t("Accept")}</Button>
                  <Button small variant="ghost" onClick={() => setInvites(invites.filter((x) => x.id !== i.id))}>{t("Reject")}</Button>
                </div>
              </div>
            );
          })}
        </div>
      </Page>
    );
  }

  const live = team.pending.filter((p) => p.exp > Date.now());
  const slots = team.members.length + live.length;
  const invite = () => {
    const v = email.trim().toLowerCase();
    const err = !v ? t("Enter an email") : !SCHOOL_RE.test(v) ? t("Use a @heilbronn.dhbw.de school email") : IN_TEAM.includes(v) ? t("That student is already in a team") : live.some((p) => p.email === v) ? t("Already invited") : slots >= 5 ? t("Your team is full (5 of 5)") : "";
    setEmailErr(err);
    if (err) return;
    setTeam({ ...team, pending: [...live, { email: v, exp: Date.now() + 24 * 3600 * 1000 }] });
    setEmail("");
    toast(t("Invite sent"), "ok");
  };
  return (
    <Page>
      <Display as="h1" size="h1" className="block">{team.name}</Display>
      <p className="mono mt-1 text-sub">{team.members.length}/5 <span className="caption text-mute">{t("members")}</span></p>
      <div className="mt-4 flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, k) => {
          const m = team.members[k];
          return m ? (
            <div key={k} className="card flex items-center gap-3 !p-3">
              <Avatar avatar={m.avatar} size={40} />
              <span className="min-w-0 flex-1 truncate font-bold">{m.name}</span>
              {m.you && <Chip tone="yellow">{t("You")}</Chip>}
            </div>
          ) : (
            <div key={k} className="flex h-[68px] items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-line px-3 text-mute">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-dashed border-line"><Icon name="plus" size={18} /></span>
              <span className="small">{k - team.members.length < live.length ? t("Invite pending") : t("Open slot")}</span>
            </div>
          );
        })}
      </div>

      <Display as="h2" size="h2" className="mt-8 block">{t("Invite by email")}</Display>
      <form className="mt-3" noValidate onSubmit={(e) => { e.preventDefault(); invite(); }}>
        <Input label={t("School email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={emailErr} placeholder="name@heilbronn.dhbw.de" hint={t("Try lena.b@heilbronn.dhbw.de to see the already-in-a-team error.")} />
        <Button type="submit" variant="cyan" className="mt-4"><Icon name="mail" /> {t("Send invite")}</Button>
      </form>

      <Display as="h2" size="h2" className="mt-8 block">{t("Pending")}</Display>
      <div className="mt-3 flex flex-col gap-3">
        {live.length === 0 && <EmptyState icon="clock" title={t("No pending invites")} body={t("Invites expire after 24 hours.")} />}
        {live.map((p) => (
          <div key={p.email} className="card flex items-center gap-3 !p-3">
            <div className="min-w-0 flex-1">
              <p className="small m-0 break-all font-bold">{p.email}</p>
              <p className="mono m-0 text-sub">{hms(p.exp - Date.now())} <span className="caption text-mute">{t("left")}</span></p>
            </div>
            <IconButton icon="close" label={t("Cancel invite to {email}", { email: p.email })} onClick={() => setTeam({ ...team, pending: live.filter((x) => x.email !== p.email) })} />
          </div>
        ))}
      </div>
      <Button variant="ghost" className="mt-8" onClick={() => { setTeam(null); toast(t("You left the team"), "ok"); }}>{t("Leave team")}</Button>
    </Page>
  );
}

/* ---------- Ranks ---------- */
export function Ranks({ points, myName, team, goTeam, toast }: { points: number; myName: string; team: TeamT | null; goTeam: () => void; toast: (m: string, t?: "error" | "ok") => void }) {
  const [tab, setTab] = useState<"solo" | "team">("solo");
  const [loading, setLoading] = useState(false);
  const clicks = useRef(0);
  const solo = ranked([...SOLO, { name: myName, pts: points, at: 99, you: true }]);
  const teamRows: Row[] = [...TEAMS, ...(team ? [{ name: team.name, pts: points + 3000, at: 99, you: true, members: team.members.length }] : [])];
  const activeTeams = ranked(teamRows.filter((t) => (t.members ?? 0) >= 2));
  const inactive = teamRows.filter((t) => (t.members ?? 0) < 2);
  const rows = tab === "solo" ? solo : activeTeams;
  const me = rows.find((r) => r.you);
  const podium = [rows[1], rows[0], rows[2]].filter(Boolean);
  const heights = [88, 112, 72];
  const colors = ["var(--sub)", "var(--accent)", "var(--ok)"];

  const refresh = () => {
    setLoading(true);
    clicks.current += 1;
    setTimeout(() => {
      setLoading(false);
      if (clicks.current % 2 === 1) toast(t("Network error. Showing saved ranks."), "error");
      else toast(t("Ranks updated"), "ok");
    }, 700);
  };

  return (
    <div className="absolute inset-0">
      <Page pb={210}>
        <div className="flex items-start justify-between">
          <Display as="h1" size="h1">{t("Ranks")}</Display>
          <IconButton icon="refresh" label={t("Refresh ranks")} onClick={refresh} className={loading ? "opacity-60" : ""} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2" role="tablist" aria-label={t("Ranking type")}>
          {(["solo", "team"] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="display h3 flex min-h-12 items-center justify-center gap-2 rounded-xl border capitalize" style={{ background: tab === k ? "var(--signal)" : "var(--surface)", color: tab === k ? "var(--on-signal)" : "var(--fg)", borderColor: tab === k ? "var(--signal)" : "var(--line)" }}>
              {k === "team" && !team && <Icon name="lock" size={18} />} {t(k)}
            </button>
          ))}
        </div>

        {tab === "team" && !team ? (
          <div className="mt-6">
            <EmptyState icon="lock" title={t("Team ranks locked")} body={t("Join or create a team to see the team board.")} action={<Button small variant="cyan" onClick={goTeam}>{t("Go to team")}</Button>} />
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-6"><EmptyState icon="ranks" title={t("No players yet")} body={t("Be the first on the board.")} /></div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-3 items-end gap-2">
              {podium.map((r, k) => (
                <div key={r.name} className="flex flex-col items-center">
                  <div className="card flex w-full flex-col items-center justify-end gap-1 !px-1 !py-2 text-center text-on" style={{ minHeight: heights[k], background: colors[k], borderColor: "transparent" }}>
                    <span className="display h2">{r.rank}</span>
                    <span className="w-full truncate text-[0.875rem] font-bold leading-5">{r.name}</span>
                    <span className="mono text-[0.875rem] leading-5">{fmt(r.pts)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {rows.slice(3).map((r) => (
                <div key={r.name} className="flex items-center gap-3 rounded-xl border px-3 py-3" style={{ background: r.you ? "var(--surface2)" : "var(--surface)", borderColor: r.you ? "var(--signal)" : "var(--line)" }}>
                  <span className="mono w-8 text-center text-[1.25rem] text-accent">{r.rank}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{r.name}{r.you && ` (${t("you")})`}</span>
                  <span className="mono">{fmt(r.pts)}</span>
                </div>
              ))}
              {tab === "team" && inactive.map((r) => (
                <div key={r.name} className="flex items-center gap-3 rounded-xl border border-dashed border-line2 px-3 py-3 text-mute">
                  <span className="mono w-8 text-center text-[1.25rem]">–</span>
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <Chip tone="mute">{t("Inactive")}</Chip>
                </div>
              ))}
            </div>
          </>
        )}
      </Page>
      {me && (
        <div className="absolute inset-x-5 z-10" style={{ bottom: 140 }}>
          <div className="card flex items-center gap-3 !py-3" style={{ background: "var(--surface)", borderColor: "var(--signal)" }}>
            <span className="mono w-8 text-center text-[1.25rem] text-accent">{me.rank}</span>
            <span className="min-w-0 flex-1 truncate font-bold">{me.name} ({t("you")})</span>
            <span className="mono text-accent">{fmt(me.pts)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Profile ---------- */
const SIZES: { id: FontSize; label: string }[] = [
  { id: "s", label: "S" },
  { id: "m", label: "M" },
  { id: "l", label: "L" },
  { id: "xl", label: "XL" },
];
const SIZE_NAME: Record<FontSize, string> = { s: "Small", m: "Medium", l: "Large", xl: "Extra large" };

function Preferences() {
  const { theme, size, lang } = useSettings();
  return (
    <section className="card mt-3 flex flex-col gap-5" aria-labelledby="prefs-h">
      <Display as="h2" size="h3">
        <span id="prefs-h">{t("Preferences")}</span>
      </Display>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="m-0 font-bold">{t("Dark mode")}</p>
          <p className="small m-0 text-mute">{t("Easier on the eyes at night.")}</p>
        </div>
        <button type="button" role="switch" aria-checked={theme === "dark"} aria-label={t("Dark mode")} className="switch" onClick={() => setSettings({ theme: theme === "dark" ? "light" : "dark" })} />
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="m-0 font-bold">{t("Font size")}</p>
          <span className="small text-mute">{t(SIZE_NAME[size])} · {Math.round(FONT_SCALE[size] * 100)}%</span>
        </div>
        <div className="seg grid-cols-4" role="radiogroup" aria-label={t("Font size")}>
          {SIZES.map((z) => (
            <button key={z.id} type="button" role="radio" aria-checked={size === z.id} aria-label={t(SIZE_NAME[z.id])} onClick={() => setSettings({ size: z.id })}>
              {z.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="m-0 mb-2 font-bold">{t("Language")}</p>
        <div className="seg grid-cols-2" role="radiogroup" aria-label={t("Language")}>
          {([["de", "Deutsch"], ["en", "English"]] as const).map(([id, name]) => (
            <button key={id} type="button" role="radio" aria-checked={lang === id} onClick={() => setSettings({ lang: id })}>
              {name}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ProfileScreen({ name, nick, email, avatar, points, team, cleared, onSignOut, on404 }: { name: string; nick: string; email: string; avatar: AvatarT; points: number; team: string | null; cleared: number; onSignOut: () => void; on404: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="absolute inset-0">
      <Page>
        <div className="flex flex-col items-center text-center">
          <Avatar avatar={avatar} size={96} label={t("Your avatar")} />
          <Display as="h1" size="h1" className="mt-4 block">{nick || name}</Display>
          <p className="small m-0 text-mute">{name}</p>
          <p className="small m-0 break-all text-mute">{email}</p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="card !p-3"><p className="caption text-mute">{t("Points")}</p><p className="mono m-0 text-[1.75rem] leading-[1.2] text-accent">{fmt(points)}</p></div>
          <div className="card !p-3"><p className="caption text-mute">{t("Cleared")}</p><p className="mono m-0 text-[1.75rem] leading-[1.2] text-ok">{cleared}/{CPS.length}</p></div>
        </div>
        <div className="card mt-3 flex items-center justify-between gap-3 !p-3">
          <span className="caption text-mute">{t("Team")}</span>
          <span className="min-w-0 truncate font-bold">{team ?? t("No team yet")}</span>
        </div>
        <Preferences />
        <div className="mt-6 flex flex-col gap-3">
          <Button variant="ghost" onClick={on404}><Icon name="map" /> {t("Test out-of-bounds page")}</Button>
          <Button variant="red" onClick={() => setConfirm(true)}><Icon name="logout" /> {t("Sign out")}</Button>
        </div>
        <div className="mt-8 flex justify-center"><Logo height={40} /></div>
      </Page>
      <Modal open={confirm} title={t("Confirm sign out")}>
        <Display as="h2" size="h2">{t("Sign out?")}</Display>
        <p className="mt-2 text-mute">{t("You will need a new code to get back in. Your progress stays saved.")}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button small variant="ghost" onClick={() => setConfirm(false)}>{t("Stay")}</Button>
          <Button small variant="red" onClick={() => { setConfirm(false); onSignOut(); }}>{t("Sign out")}</Button>
        </div>
      </Modal>
    </div>
  );
}

export function NotFound({ onHome }: { onHome: () => void }) {
  return (
    <Page className="flex flex-col items-center justify-center text-center">
      <div className="halftone absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative">
        <p className="mono m-0 text-[6rem] leading-[1.05] text-signal">404</p>
        <Display as="h1" size="h1" className="block">{t("Out of bounds")}</Display>
        <p className="mx-auto mt-3 max-w-[280px] text-mute">{t("This spot is not on the campus map. Head back to the field.")}</p>
        <Button variant="red" className="mt-6" onClick={onHome}>{t("Back to map")}</Button>
      </div>
    </Page>
  );
}
