import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Button } from '../components/Button.jsx';
import { Icon, IconButton } from '../components/icons.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { Display } from '../components/ui.jsx';
import { useGeolocation } from '../hooks/useGeolocation.js';
import { useSession } from '../hooks/useSession.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { t } from '../i18n.js';

const FAKE_ALLOWED = import.meta.env.DEV && import.meta.env.VITE_DEV_FAKE_LOCATION === 'true';
const SUCCESS_PAUSE_MS = 900;

/**
 * Location check and unlock (BR12). One fresh position sample is sent to the server when the player
 * starts the quest; inside the circle the quiz unlocks at once. Poor accuracy, an old reading, a refusal
 * or being outside the radius uses no attempt and starts no timer.
 */
export default function Locate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { student, refresh } = useSession();
  const { locate } = useGeolocation();
  const isAdmin = student?.role === 'admin';
  const [checkpoint, setCheckpoint] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [elsewhere, setElsewhere] = useState(null);
  const [weakWhy, setWeakWhy] = useState('accuracy'); // accuracy | stale | device
  const [asking, setAsking] = useState(false);
  const [pretend, setPretend] = useState(false);
  const [run, setRun] = useState(0);
  const heading = useRef(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .checkpoints()
      .then(({ checkpoints }) => {
        if (!alive) return;
        const found = checkpoints.find((c) => c.id === Number(id));
        if (!found) navigate('/map', { replace: true });
        else setCheckpoint(found);
      })
      .catch((error) => alive && toast.error(errorText(error)));
    return () => {
      alive = false;
    };
  }, [id, navigate, toast]);

  const check = useCallback(async () => {
    if (!checkpoint) return;
    setPhase('scan');
    const fake = pretend
      ? { latitude: checkpoint.latitude, longitude: checkpoint.longitude, accuracy: 10 }
      : undefined;
    // Administrators test the quiz from anywhere: the server skips the location rule for them.
    const { sample, failure } = isAdmin
      ? {
          sample: {
            latitude: checkpoint.latitude,
            longitude: checkpoint.longitude,
            accuracy: 1,
            ageMs: 0,
          },
        }
      : await locate(fake);
    if (failure) {
      setWeakWhy('device');
      setPhase(failure === 'denied' ? 'denied' : 'weak');
      return;
    }
    try {
      // Inside the circle the server unlocks the quiz right away: this is when the timer starts (BR13).
      const result = await api.verifyLocation(checkpoint.id, sample);
      if (result.status === 'OK') {
        setPhase('success');
        setTimeout(
          () => navigate(`/quiz/${result.attempt.id}`, { replace: true }),
          SUCCESS_PAUSE_MS,
        );
      } else {
        setElsewhere(result.elsewhere ?? null);
        setPhase('far');
      }
    } catch (error) {
      if (error.code === 'ACTIVE_ATTEMPT_EXISTS') {
        navigate(`/quiz/${error.details.attemptId}`, { replace: true });
        return;
      }
      if (error.code === 'ALREADY_COMPLETED') {
        toast.info(t('Checkpoint cleared'));
        navigate('/map', { replace: true });
        return;
      }
      if (error.code === 'NOT_AVAILABLE') {
        toast.error(errorText(error));
        navigate('/map', { replace: true });
        return;
      }
      if (error.code === 'CONSENT_REQUIRED') {
        setPhase('idle');
        setAsking(true);
        return;
      }
      // ACCURACY_TOO_LOW and STALE_POSITION are plain retries; anything else is shown as well.
      if (error.code !== 'ACCURACY_TOO_LOW' && error.code !== 'STALE_POSITION') {
        toast.error(errorText(error));
      }
      setWeakWhy(error.code === 'STALE_POSITION' ? 'stale' : 'accuracy');
      setPhase('weak');
    }
  }, [checkpoint, isAdmin, locate, navigate, pretend, toast]);

  // Start scanning as soon as the checkpoint is known and the location notice has been accepted.
  useEffect(() => {
    if (!checkpoint || !student || phase !== 'idle') return;
    if (!student.locationConsent && !isAdmin) setAsking(true);
    else check();
  }, [checkpoint, student, phase, check, isAdmin]);

  useEffect(() => {
    if (run > 0) check();
    // A new run is requested by the "check again" buttons only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const accept = async () => {
    try {
      await api.consent();
      await refresh();
      setAsking(false);
      setPhase('idle');
    } catch (error) {
      setAsking(false);
      toast.error(errorText(error));
    }
  };

  const COPY = {
    idle: { title: t('Scanning…'), body: t('Hold still while we find you.'), color: 'var(--sub)' },
    scan: { title: t('Scanning…'), body: t('Hold still while we find you.'), color: 'var(--sub)' },
    success: {
      title: t('Locked on!'),
      body: t('You are at {name}.', { name: checkpoint?.name ?? '' }),
      color: 'var(--ok)',
    },
    weak: {
      title: t('Weak signal'),
      body: {
        accuracy: t('GPS signal weak — try again. No attempt used.'),
        stale: t('Your location reading was too old — try again. No attempt used.'),
        device: t('Your browser could not find a position — try again. No attempt used.'),
      }[weakWhy],
      color: 'var(--warn)',
    },
    far: {
      title: t('Not there yet'),
      body: elsewhere
        ? t('You are at {other}, not at {name}. Walk to {name} and check again. No attempt used.', {
            other: elsewhere,
            name: checkpoint?.name ?? '',
          })
        : t('You are not at {name} yet. Walk closer and check again. No attempt used.', {
            name: checkpoint?.name ?? '',
          }),
      color: 'var(--warn)',
    },
    denied: {
      title: t('Location is off'),
      body: t(
        'Campus & City Quest needs your location to check that you are at the spot. Turn it on in your browser settings, then check again.',
      ),
      color: 'var(--warn)',
    },
  }[phase];

  const ringColor =
    phase === 'success'
      ? 'var(--ok)'
      : phase === 'scan' || phase === 'idle'
        ? 'var(--surface2)'
        : 'var(--warn)';

  return (
    <main className="page page--narrow">
      <div className="row">
        <IconButton icon="back" label={t('Back to map')} onClick={() => navigate('/map')} />
        <Display as="h1" size="h2" ref={heading} tabIndex={-1}>
          {t('Location check')}
        </Display>
      </div>
      <p className="small muted mt">
        {checkpoint?.name} · {t('the timer starts once your location is confirmed')}
      </p>
      {isAdmin && (
        <p className="card card--flat small" role="note">
          {t('Admin test mode: no location needed, no points.')}
        </p>
      )}

      <div className="radar" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="radar__ring" style={{ inset: i * 40, borderColor: ringColor }} />
        ))}
        {phase === 'scan' && <span className="radar__sweep" />}
        <span
          className={`radar__core${phase === 'success' ? ' anim-pop' : ''}`}
          style={{ background: COPY.color }}
        >
          <Icon
            name={
              phase === 'success' ? 'check' : phase === 'scan' || phase === 'idle' ? 'gps' : 'warn'
            }
            size={32}
          />
        </span>
      </div>

      <div className="radar__text" aria-live="polite">
        <Display as="h2" size="h2">
          {COPY.title}
        </Display>
        <p className="muted">{COPY.body}</p>
      </div>

      <div className="stack mt">
        {(phase === 'weak' || phase === 'far') && (
          <Button variant="dark" onClick={() => setRun((n) => n + 1)}>
            <Icon name="refresh" /> {t('Try again')}
          </Button>
        )}
        {phase === 'denied' && (
          <Button variant="sub" onClick={() => setRun((n) => n + 1)}>
            <Icon name="gps" /> {t('Check again')}
          </Button>
        )}
        {FAKE_ALLOWED && (
          <label className="row small muted">
            <input
              type="checkbox"
              checked={pretend}
              onChange={(event) => setPretend(event.target.checked)}
            />
            {t('Pretend I am here (development only)')}
          </label>
        )}
      </div>

      {asking && (
        <Sheet title={t('Location notice')} locked>
          <Display size="h2">{t('Location notice')}</Display>
          <p className="mt">
            {t(
              'We use your phone location once, when you start a quiz, to see whether you are at the checkpoint. We keep only "inside the radius: yes or no" and the time. We never store coordinates.',
            )}
          </p>
          <div className="stack mt">
            <Button data-autofocus onClick={accept}>
              {t('I agree')}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/map')}>
              {t('Not now')}
            </Button>
          </div>
        </Sheet>
      )}
    </main>
  );
}
