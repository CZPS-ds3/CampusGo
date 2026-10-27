import { useEffect, useRef, useState } from "react";
import { Avatar, GoBadge, Button, Chip, Display, Icon, IconButton, Input, LangSwitch, Logo, OTPBox, PRESET_COUNT, Sheet, useLongPress } from "./ui";
import { setSettings, t, useSettings } from "./i18n";
import { SCHOOL_RE, mmss, type AvatarT } from "./data";

export function Splash({ onStart }: { onStart: () => void }) {
  const [ready, setReady] = useState(false);
  const { lang } = useSettings();
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
      <div className="halftone absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="absolute right-5" style={{ top: 57 }}>
        <LangSwitch lang={lang} onChange={(l) => setSettings({ lang: l })} />
      </div>
      <div className="relative flex flex-col items-center">
        <div className="anim-pop">
          <Logo height={96} />
        </div>
        <div className="anim-fade mt-10" style={{ animationDelay: "400ms" }}>
          <div className="display !block text-[2.75rem] leading-[1.05] text-fg">Campus</div>
          <div className="display !block text-[1.875rem] leading-[1.15] text-accent">&amp; City Quest</div>
        </div>
        <div className="mt-4 h-1 w-16 rounded-full bg-signal" aria-hidden="true" />
        <p className="caption mt-4 text-mute">{t("DHBW Heilbronn · Orientation game")}</p>
      </div>
      <div className="absolute inset-x-5" style={{ bottom: 64 }}>
        {ready ? (
          <Button onClick={onStart} className="anim-pop">
            {t("Start")} <Icon name="arrow" />
          </Button>
        ) : (
          <p className="caption text-mute">{t("Loading campus…")}</p>
        )}
      </div>
    </div>
  );
}

const DEMO = ["anna.k@heilbronn.dhbw.de", "new@heilbronn.dhbw.de"];

export function Login({ onSend }: { onSend: (email: string) => void }) {
  const { lang } = useSettings();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);
  const submit = () => {
    const v = email.trim();
    const err = !v ? t("Enter your email") : !SCHOOL_RE.test(v) ? t("Use your @heilbronn.dhbw.de school email") : "";
    setError(err);
    if (err) setShake((s) => s + 1);
    else onSend(v.toLowerCase());
  };
  return (
    <main className="absolute inset-0 overflow-y-auto px-5" style={{ paddingTop: 67, paddingBottom: 54 }}>
      <div className="halftone absolute inset-x-0 top-0 h-64 opacity-60" aria-hidden="true" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <Logo height={44} />
          <LangSwitch lang={lang} onChange={(l) => setSettings({ lang: l })} />
        </div>
        <div className="mt-6">
          <Chip tone="cyan" icon="mail">
            {t("Step {n} of 2", { n: 1 })}
          </Chip>
        </div>
        <Display as="h1" size="h1" className="mt-4 block">
          {t("Log in to")}<br />
          <span className="text-accent">{t("start the quest")}</span>
        </Display>
        <p className="mt-4 text-mute">{t("Use your school email. We send a 6-digit code, no password needed.")}</p>
        <form
          className="mt-8"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div key={shake} className={shake ? "anim-shake" : ""}>
            <Input label={t("School email")} type="email" inputMode="email" autoComplete="email" placeholder="name@heilbronn.dhbw.de" value={email} onChange={(e) => setEmail(e.target.value)} error={error} hint={t("Only @heilbronn.dhbw.de addresses work.")} />
          </div>
          <Button type="submit" className="mt-6">
            {t("Send code")} <Icon name="arrow" />
          </Button>
        </form>
        <div className="mt-8">
          <p className="caption mb-2 text-mute">{t("Demo accounts")}</p>
          <div className="flex flex-col gap-2">
            {DEMO.map((d) => (
              <button key={d} type="button" onClick={() => setEmail(d)} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-left">
                <span className="small break-all">{d}</span>
                <Chip tone={d.startsWith("new") ? "yellow" : "mint"}>{d.startsWith("new") ? t("First login") : t("Returning")}</Chip>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

export function Otp({ email, onBack, onSuccess, toast }: { email: string; onBack: () => void; onSuccess: () => void; toast: (m: string, t?: "error" | "ok") => void }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [tries, setTries] = useState(5);
  const [lock, setLock] = useState(0);
  const [expires, setExpires] = useState(600);
  const [resend, setResend] = useState(30);
  const [shake, setShake] = useState(0);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [inbox, setInbox] = useState(false);
  const [chip, setChip] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const id = setInterval(() => {
      setExpires((e) => Math.max(0, e - 1));
      setResend((r) => Math.max(0, r - 1));
      setLock((l) => Math.max(0, l - 1));
    }, 1000);
    const c = setTimeout(() => setChip(true), 700);
    return () => {
      clearInterval(id);
      clearTimeout(c);
    };
  }, []);
  useEffect(() => {
    if (lock === 0 && tries === 0) {
      setTries(5);
      setMsg("");
    }
  }, [lock, tries]);
  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (shake && lock === 0) refs.current[0]?.focus();
  }, [shake, lock]);

  const devExpire = useLongPress(() => {
    setExpires(4);
    toast(t("Dev: code expires in 4 s"), "ok");
  });

  const verify = (d: string[]) => {
    const code = d.join("");
    if (expires <= 0) {
      setMsg(t("This code has expired. Request a new one."));
      return;
    }
    if (code === "123456") {
      setOk(true);
      setMsg("");
      setTimeout(onSuccess, 700);
      return;
    }
    const left = tries - 1;
    setTries(left);
    setShake((s) => s + 1);
    setDigits(Array(6).fill(""));
    if (left <= 0) {
      setLock(60);
      setMsg(t("Too many wrong tries. Input locked for 60 seconds."));
    } else {
      setMsg(t("That code is wrong."));
      refs.current[0]?.focus();
    }
  };

  const fill = (start: number, raw: string) => {
    const nums = raw.replace(/\D/g, "").slice(0, 6 - start).split("");
    if (!nums.length) return;
    const next = [...digits];
    nums.forEach((n, i) => (next[start + i] = n));
    setDigits(next);
    const to = Math.min(5, start + nums.length);
    refs.current[to]?.focus();
    if (next.every(Boolean)) verify(next);
  };

  const locked = lock > 0;
  const expired = expires <= 0;
  const disabled = locked || expired || ok;

  return (
    <div className="absolute inset-0">
    <main className="absolute inset-0 overflow-y-auto px-5" style={{ paddingTop: 67, paddingBottom: 120 }}>
      <div className="flex items-center gap-3">
        <IconButton icon="back" label={t("Back to email")} onClick={onBack} />
        <Chip tone="cyan" icon="mail">{t("Step {n} of 2", { n: 2 })}</Chip>
      </div>
      <div {...devExpire} className="mt-6 select-none">
        <Display as="h1" size="h1" className="block">{t("Enter the")}<br /><span className="text-accent">{t("6-digit code")}</span></Display>
      </div>
      <p className="small mt-4 text-mute">
        {t("If the account exists, an email containing the OTP has been sent.")}
      </p>
      <p className="small mt-1 break-all text-fg">{email}</p>

      <div key={shake} className={`mt-8 flex justify-between gap-1.5 ${shake ? "anim-shake" : ""}`}>
        {digits.map((d, i) => (
          <OTPBox
            key={i}
            index={i}
            value={d}
            disabled={disabled}
            refCb={(el) => (refs.current[i] = el)}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              if (!v) {
                const n = [...digits];
                n[i] = "";
                setDigits(n);
                return;
              }
              fill(i, v.length > 1 ? v : v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) {
                const n = [...digits];
                n[i - 1] = "";
                setDigits(n);
                refs.current[i - 1]?.focus();
              }
            }}
            onPaste={(e) => {
              e.preventDefault();
              const t = e.clipboardData.getData("text").replace(/\D/g, "");
              if (t.length >= 6) fill(0, t);
              else fill(i, t);
            }}
          />
        ))}
      </div>

      <div className="mt-4 min-h-[44px]" aria-live="polite">
        {msg && (
          <p className="small flex items-start gap-2 text-warn">
            <Icon name="warn" size={18} className="mt-0.5" />
            <span>
              {msg}
              {!expired && !locked && tries < 5 && tries > 0 && <b className="ml-1">{t(tries === 1 ? "{n} try left" : "{n} tries left", { n: tries })}</b>}
              {locked && <b className="mono ml-1">{lock}s</b>}
            </span>
          </p>
        )}
        {expired && !msg && <p className="small text-warn">{t("This code has expired. Request a new one.")}</p>}
      </div>

      <div className="card mt-2 flex items-center justify-between">
        <div>
          <p className="caption text-mute">{t("Code expires in")}</p>
          <p className={`mono m-0 text-[1.75rem] leading-[2rem] ${expires <= 60 ? "text-warn" : "text-sub"}`}>{mmss(expires)}</p>
        </div>
        <Icon name="clock" size={32} className="text-mute" />
      </div>

      <Button
        variant={expired ? "yellow" : "ghost"}
        className="mt-4"
        disabled={resend > 0 && !expired}
        onClick={() => {
          setExpires(600);
          setResend(30);
          setTries(5);
          setLock(0);
          setMsg("");
          setDigits(Array(6).fill(""));
          refs.current[0]?.focus();
          toast(t("If the account exists, an email containing the OTP has been sent."), "ok");
        }}
      >
        <Icon name="refresh" />
        {resend > 0 && !expired ? t("Resend in {n}s", { n: resend }) : t("Resend code")}
      </Button>

    </main>
      {ok && <div className="anim-fade absolute inset-0 z-10 flex items-center justify-center bg-ok"><div className="anim-pop text-on"><Icon name="check" size={96} /></div></div>}
      {chip && (
        <button type="button" onClick={() => setInbox(true)} className="anim-slideup absolute left-5 right-5 flex min-h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] border-sub bg-surface text-sub" style={{ bottom: 54 }}>
          <Icon name="mail" size={20} />
          <span className="caption">{t("Open mock inbox")}</span>
        </button>
      )}

      <Sheet open={inbox} onClose={() => setInbox(false)} title={t("Mock inbox")}>
        <div className="mb-3 flex items-center justify-between">
          <Display size="h3">{t("Mock inbox")}</Display>
          <IconButton icon="close" label={t("Close inbox")} onClick={() => setInbox(false)} />
        </div>
        <div className="card bg-surface2">
          <p className="caption text-mute">{t("From")}</p>
          <p className="m-0 font-bold">Campus &amp; City Quest</p>
          <p className="caption mt-2 text-mute">{t("Subject")}</p>
          <p className="m-0 font-bold">{t("Your login code")}</p>
          <hr className="my-3 border-0 border-t border-line2" />
          <p className="small m-0 text-fg">{t("Use this code to finish logging in. It expires in 10 minutes.")}</p>
          <p className="mono mb-0 mt-3 text-center text-[2.5rem] leading-[2.75rem] tracking-[0.2em] text-accent">123456</p>
        </div>
        <Button variant="cyan" className="mt-4" onClick={() => { setInbox(false); fill(0, "123456"); }}>
          {t("Use this code")}
        </Button>
      </Sheet>
    </div>
  );
}

export type Profile = { first: string; last: string; nick: string; avatar: AvatarT };

export function Signup({ email, onDone }: { email: string; onDone: (p: Profile) => void }) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [nick, setNick] = useState("");
  const [avatar, setAvatar] = useState<AvatarT>({ kind: "preset", i: 0 });
  const [errs, setErrs] = useState<{ first?: string; last?: string }>({});
  const file = useRef<HTMLInputElement>(null);
  const submit = () => {
    const e = { first: first.trim() ? undefined : t("First name is required"), last: last.trim() ? undefined : t("Last name is required") };
    setErrs(e);
    if (!e.first && !e.last) onDone({ first: first.trim(), last: last.trim(), nick: nick.trim(), avatar });
  };
  return (
    <main className="absolute inset-0 overflow-y-auto px-5" style={{ paddingTop: 67, paddingBottom: 54 }}>
      <div className="flex items-center justify-between gap-3"><Chip tone="yellow">{t("First login")}</Chip><Logo height={36} /></div>
      <Display as="h1" size="h1" className="mt-4 block">{t("Create your")}<br /><span className="text-accent">{t("player card")}</span></Display>
      <p className="small mt-2 break-all text-mute">{email}</p>
      <form className="mt-6 flex flex-col gap-5" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="flex items-center gap-4">
          <Avatar avatar={avatar} size={96} label={t("Profile picture preview")} />
          <div className="flex-1">
            <button type="button" onClick={() => file.current?.click()} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-sub text-sub">
              <Icon name="upload" />
              <span className="caption">{t("Upload photo")}</span>
            </button>
            <input ref={file} type="file" accept="image/*" className="hidden" aria-label={t("Upload profile picture")} onChange={(e) => { const f = e.target.files?.[0]; if (f) setAvatar({ kind: "img", url: URL.createObjectURL(f) }); }} />
            <p className="small mt-1 text-mute">{t("Optional")}</p>
          </div>
        </div>
        <div className="flex justify-between" role="radiogroup" aria-label={t("Preset avatars")}>
          {Array.from({ length: PRESET_COUNT }).map((_, i) => {
            const sel = avatar.kind === "preset" && avatar.i === i;
            return (
              <button key={i} type="button" role="radio" aria-checked={sel} aria-label={t("Avatar {n}", { n: i + 1 })} onClick={() => setAvatar({ kind: "preset", i })} className="flex min-h-12 w-12 items-center justify-center rounded-full border-0 bg-transparent p-0" style={{ outline: sel ? "3px solid var(--signal)" : "none", outlineOffset: 2 }}>
                <Avatar avatar={{ kind: "preset", i }} size={44} />
              </button>
            );
          })}
        </div>
        <Input label={t("First name *")} value={first} onChange={(e) => setFirst(e.target.value)} error={errs.first} autoComplete="given-name" />
        <Input label={t("Last name *")} value={last} onChange={(e) => setLast(e.target.value)} error={errs.last} autoComplete="family-name" />
        <Input label={t("Nickname (optional)")} value={nick} onChange={(e) => setNick(e.target.value)} hint={t("Shown on rankings instead of your last name.")} maxLength={16} />
        <Button type="submit" variant="mint">{t("Enter campus")} <Icon name="arrow" /></Button>
      </form>
    </main>
  );
}
