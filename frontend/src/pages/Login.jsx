import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Button } from '../components/Button.jsx';
import { OTPInput } from '../components/OTPInput.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { copy } from '../i18n.js';

const RESEND_SECONDS = 30;
const SCHOOL_DOMAIN = 'heilbronn.dhbw.de';
const SHOW_DEV_FILL = import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS !== 'true';

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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const heading = useRef(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  if (ready && student) return <Navigate to={state?.from ?? '/map'} replace />;

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
    if (!looksLikeSchoolEmail(email)) {
      setError(copy.login.emailInvalid);
      return undefined;
    }
    return run(async () => {
      await api.requestOtp(email.trim());
      setCode('');
      setCooldown(RESEND_SECONDS);
      setStep('otp');
    });
  };

  const verify = (event) => {
    event?.preventDefault();
    if (code.length !== 6) return undefined;
    return run(async () => {
      try {
        const body = { email: email.trim(), otp: code };
        const result = await api.verify(
          step === 'profile' ? { ...body, ...cleanProfile(profile) } : body,
        );
        if (result.status === 'profile_required') {
          setStep('profile');
          return;
        }
        setStudent(result.student);
        navigate(state?.from ?? '/map', { replace: true });
      } catch (failure) {
        if (failure.code === 'INVALID_CODE') {
          setCode('');
          throw Object.assign(failure, { message: copy.login.codeInvalid });
        }
        throw failure;
      }
    });
  };

  const fillDevCode = () =>
    run(async () => {
      const { otp } = await api.devLastOtp(email.trim());
      setCode(otp);
    });

  return (
    <main className="login">
      <section className="login__card panel panel--paper" aria-labelledby="login-title">
        <h1 id="login-title" ref={heading} tabIndex={-1} className="display login__title">
          {step === 'email'
            ? copy.login.title
            : step === 'otp'
              ? copy.login.otpTitle
              : copy.login.profileTitle}
        </h1>

        {step === 'email' && (
          <form className="stack" onSubmit={sendCode} noValidate>
            <div className="field">
              <label className="field__label" htmlFor="email">
                {copy.login.emailLabel}
              </label>
              <input
                id="email"
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby="email-hint email-error"
                onChange={(event) => setEmail(event.target.value)}
              />
              <p id="email-hint" className="field__hint">
                {copy.login.emailHint}
              </p>
              {error && (
                <p id="email-error" className="field__error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <Button type="submit" block busy={busy}>
              {copy.login.sendCode}
            </Button>
          </form>
        )}

        {step === 'otp' && (
          <form className="stack" onSubmit={verify}>
            <p>{copy.login.otpHint(email.trim())}</p>
            <OTPInput value={code} onChange={setCode} disabled={busy} />
            {error && (
              <p className="field__error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" block busy={busy} disabled={code.length !== 6}>
              {copy.login.verify}
            </Button>
            <div className="row">
              <Button variant="quiet" small disabled={cooldown > 0 || busy} onClick={sendCode}>
                {cooldown > 0 ? copy.login.resendIn(cooldown) : copy.login.resend}
              </Button>
              {SHOW_DEV_FILL && (
                <Button variant="quiet" small disabled={busy} onClick={fillDevCode}>
                  {copy.login.devFill}
                </Button>
              )}
            </div>
          </form>
        )}

        {step === 'profile' && (
          <form className="stack" onSubmit={verify}>
            <p>{copy.login.profileHint}</p>
            {[
              ['firstName', copy.login.firstName, 'given-name'],
              ['lastName', copy.login.lastName, 'family-name'],
              ['nickname', copy.login.nickname, 'nickname'],
            ].map(([key, label, autoComplete]) => (
              <div className="field" key={key}>
                <label className="field__label" htmlFor={key}>
                  {label}
                </label>
                <input
                  id={key}
                  className="input"
                  autoComplete={autoComplete}
                  maxLength={key === 'nickname' ? 20 : 50}
                  value={profile[key]}
                  onChange={(event) => setProfile({ ...profile, [key]: event.target.value })}
                />
              </div>
            ))}
            {error && (
              <p className="field__error" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              block
              busy={busy}
              disabled={!profile.firstName.trim() || !profile.lastName.trim()}
            >
              {copy.login.createProfile}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}

const cleanProfile = (profile) => ({
  firstName: profile.firstName.trim(),
  lastName: profile.lastName.trim(),
  nickname: profile.nickname.trim() || undefined,
});
