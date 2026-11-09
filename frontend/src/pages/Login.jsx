import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, USE_MOCKS } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Avatar, PRESET_COUNT } from '../components/Avatar.jsx';
import { Button } from '../components/Button.jsx';
import { Icon, IconButton } from '../components/icons.jsx';
import { OTPInput } from '../components/OTPInput.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { Chip, Display, Input, LangSwitch, Logo } from '../components/ui.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { formatClock } from '../hooks/useServerTimer.js';
import { t } from '../i18n.js';

const RESEND_SECONDS = USE_MOCKS ? 0 : 30;
const CODE_LIFETIME_SECONDS = 600;
const SCHOOL_DOMAIN = 'heilbronn.dhbw.de';
// Only the in-browser mock API (no backend) shows its fake inbox; the real API sends real e-mails.
const SHOW_INBOX = USE_MOCKS;

const looksLikeSchoolEmail = (value) => {
  const email = value.trim().toLowerCase();
  const parts = email.split('@');
  return (
    parts.length === 2 &&
    parts[0].length > 0 &&
    (parts[1] === SCHOOL_DOMAIN || parts[1].endsWith(`.${SCHOOL_DOMAIN}`))
  );
};

export default function Login() {
  const { student, ready, setStudent } = useSession();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [profile, setProfile] = useState({ firstName: '', lastName: '', nickname: '' });
  const [avatarPreset, setAvatarPreset] = useState(0);
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [expires, setExpires] = useState(CODE_LIFETIME_SECONDS);
  const [inbox, setInbox] = useState(null);
  const [welcome, setWelcome] = useState(false);
  const heading = useRef(null);
  const fileInput = useRef(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    if (step === 'email') return undefined;
    const id = setInterval(() => {
      setCooldown((s) => Math.max(0, s - 1));
      setExpires((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  if (ready && student && !welcome) return <Navigate to={state?.from ?? '/map'} replace />;

  const run = async (work) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (event) => {
    event?.preventDefault();
    if (!email.trim()) {
      setError(t('Enter your email'));
      setShake((n) => n + 1);
      return undefined;
    }
    if (!looksLikeSchoolEmail(email)) {
      setError(t('Use your @heilbronn.dhbw.de school email'));
      setShake((n) => n + 1);
      return undefined;
    }
    return run(async () => {
      await api.requestOtp(email.trim());
      setCode('');
      setCooldown(RESEND_SECONDS);
      setExpires(CODE_LIFETIME_SECONDS);
      setStep('otp');
    });
  };

  const finish = async (result) => {
    setWelcome(true); // before the session appears, so the guard above does not redirect early
    setStudent(result.student);
    if (photo) {
      try {
        await api.uploadPicture(photo);
      } catch {
        // The picture is optional; a failed upload must not block the first login.
      }
    }
    setTimeout(() => navigate(state?.from ?? '/map', { replace: true }), 700);
  };

  const verify = (digits, withProfile) =>
    run(async () => {
      const body = { email: email.trim(), otp: digits };
      if (withProfile) {
        Object.assign(body, {
          firstName: profile.firstName.trim(),
          lastName: profile.lastName.trim(),
          nickname: profile.nickname.trim() || undefined,
          avatarPreset,
        });
      }
      try {
        const result = await api.verify(body);
        if (result.status === 'profile_required') {
          setStep('profile');
          return;
        }
        await finish(result);
      } catch (failure) {
        if (failure.code === 'INVALID_CODE') {
          setCode('');
          setShake((n) => n + 1);
          throw Object.assign(failure, { message: t('That code is wrong or has expired.') });
        }
        throw failure;
      }
    });

  const onCodeChange = (value) => {
    setCode(value);
    if (value.length === 6 && !busy) verify(value, false);
  };

  const openInbox = () =>
    run(async () => {
      const { otp } = await api.devLastOtp(email.trim());
      setInbox(otp);
    });

  const submitProfile = (event) => {
    event.preventDefault();
    if (!profile.firstName.trim() || !profile.lastName.trim()) {
      setError(t('First and last name are required'));
      return;
    }
    verify(code, true);
  };

  const expired = expires <= 0;

  return (
    <main className="login">
      <div className="halftone login__dots" aria-hidden="true" />
      <div className="login__inner">
        {step === 'email' && (
          <>
            <div className="login__top">
              <Logo height={44} />
              <LangSwitch />
            </div>
            <Chip tone="sub" icon="mail">
              {t('Step {n} of 2', { n: 1 })}
            </Chip>
            <Display as="h1" size="h1" ref={heading} tabIndex={-1} className="login__title">
              {t('Log in to')}
              <br />
              <span className="accent">{t('start the quest')}</span>
            </Display>
            <p className="muted">
              {t('Use your school email. We send a 6-digit code, no password needed.')}
            </p>
            <form className="stack" noValidate onSubmit={sendCode}>
              <div key={shake} className={shake ? 'anim-shake' : ''}>
                <Input
                  label={t('School email')}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="name@heilbronn.dhbw.de"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  error={error}
                  hint={t('Only @heilbronn.dhbw.de addresses work.')}
                />
              </div>
              <Button type="submit" busy={busy}>
                {t('Send code')} <Icon name="arrow" />
              </Button>
            </form>
          </>
        )}

        {step === 'otp' && (
          <>
            <div className="row">
              <IconButton
                icon="back"
                label={t('Back to email')}
                onClick={() => {
                  setStep('email');
                  setError('');
                }}
              />
              <Chip tone="sub" icon="mail">
                {t('Step {n} of 2', { n: 2 })}
              </Chip>
            </div>
            <Display as="h1" size="h1" ref={heading} tabIndex={-1} className="login__title">
              {t('Enter the')}
              <br />
              <span className="accent">{t('6-digit code')}</span>
            </Display>
            <div>
              <p className="small muted">
                {t('If the account exists, an email containing the OTP has been sent.')}
              </p>
              <p className="small login__email">{email.trim()}</p>
            </div>
            <OTPInput
              value={code}
              onChange={onCodeChange}
              disabled={busy || expired}
              shake={shake}
            />
            <div className="login__message" aria-live="polite">
              {error && (
                <p className="field-note field-note--error" role="alert">
                  <Icon name="warn" size={18} />
                  <span>{error}</span>
                </p>
              )}
              {expired && !error && (
                <p className="field-note field-note--error">
                  <Icon name="warn" size={18} />
                  <span>{t('This code has expired. Request a new one.')}</span>
                </p>
              )}
            </div>
            <div className="card login__timer">
              <div>
                <p className="caption muted">{t('Code expires in')}</p>
                <p className={`mono h2 ${expires <= 60 ? 'warn-text' : ''}`}>
                  {formatClock(expires)}
                </p>
              </div>
              <Icon name="clock" size={32} />
            </div>
            <Button
              variant={expired ? 'dark' : 'ghost'}
              disabled={cooldown > 0 && !expired}
              onClick={sendCode}
              busy={busy && !code}
            >
              <Icon name="refresh" />
              {cooldown > 0 && !expired ? t('Resend in {n}s', { n: cooldown }) : t('Resend code')}
            </Button>
            {SHOW_INBOX && (
              <Button variant="ghost" onClick={openInbox}>
                <Icon name="mail" /> {t('Open mock inbox')}
              </Button>
            )}
          </>
        )}

        {step === 'profile' && (
          <form className="stack" noValidate onSubmit={submitProfile}>
            <div className="login__top">
              <Chip tone="accent">{t('First login')}</Chip>
              <Logo height={36} />
            </div>
            <Display as="h1" size="h1" ref={heading} tabIndex={-1} className="login__title">
              {t('Create your')}
              <br />
              <span className="accent">{t('player card')}</span>
            </Display>
            <p className="small muted login__email">{email.trim()}</p>
            <div className="row login__photo">
              <Avatar
                size={96}
                avatar={{
                  url: photo ? URL.createObjectURL(photo) : undefined,
                  preset: avatarPreset,
                }}
                label={t('Profile picture preview')}
              />
              <div className="login__upload">
                <button
                  type="button"
                  className="dashed-btn"
                  onClick={() => fileInput.current?.click()}
                >
                  <Icon name="upload" />
                  <span className="caption">{t('Upload photo')}</span>
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  className="sr-only"
                  accept="image/png,image/jpeg,image/webp"
                  tabIndex={-1}
                  aria-label={t('Upload profile picture')}
                  onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
                />
                <p className="small muted">{t('Optional')}</p>
              </div>
            </div>
            <div className="presets" role="radiogroup" aria-label={t('Preset avatars')}>
              {Array.from({ length: PRESET_COUNT }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={avatarPreset === i && !photo}
                  aria-label={t('Avatar {n}', { n: i + 1 })}
                  className="preset"
                  onClick={() => {
                    setAvatarPreset(i);
                    setPhoto(null);
                  }}
                >
                  <Avatar size={44} avatar={{ preset: i }} />
                </button>
              ))}
            </div>
            <Input
              label={t('First name *')}
              autoComplete="given-name"
              maxLength={50}
              value={profile.firstName}
              onChange={(event) => setProfile({ ...profile, firstName: event.target.value })}
            />
            <Input
              label={t('Last name *')}
              autoComplete="family-name"
              maxLength={50}
              value={profile.lastName}
              onChange={(event) => setProfile({ ...profile, lastName: event.target.value })}
            />
            <Input
              label={t('Nickname (optional)')}
              maxLength={20}
              value={profile.nickname}
              onChange={(event) => setProfile({ ...profile, nickname: event.target.value })}
              hint={t('Shown on rankings instead of your last name.')}
              error={error}
            />
            <Button type="submit" variant="ok" busy={busy}>
              {t('Enter campus')} <Icon name="arrow" />
            </Button>
          </form>
        )}
      </div>

      {welcome && (
        <div className="login__done anim-fade" role="status">
          <span className="anim-pop">
            <Icon name="check" size={96} />
          </span>
          <span className="sr-only">{t('Logged in')}</span>
        </div>
      )}

      {inbox && (
        <Sheet title={t('Mock inbox')} onClose={() => setInbox(null)}>
          <div className="row row--between">
            <Display size="h3">{t('Mock inbox')}</Display>
            <IconButton icon="close" label={t('Close inbox')} onClick={() => setInbox(null)} />
          </div>
          <div className="card card--flat stack stack--tight">
            <p className="caption muted">{t('From')}</p>
            <p className="strong">Campus &amp; City Quest</p>
            <p className="caption muted">{t('Subject')}</p>
            <p className="strong">{t('Your login code')}</p>
            <hr className="rule" />
            <p className="small">
              {t('Use this code to finish logging in. It expires in 10 minutes.')}
            </p>
            <p className="mono inbox__code">{inbox}</p>
          </div>
          <Button
            variant="sub"
            className="mt"
            data-autofocus
            onClick={() => {
              setInbox(null);
              onCodeChange(inbox);
            }}
          >
            {t('Use this code')}
          </Button>
        </Sheet>
      )}
    </main>
  );
}
