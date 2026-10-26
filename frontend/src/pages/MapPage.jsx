import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Button } from '../components/Button.jsx';
import { Icon } from '../components/icons.jsx';
import { MapView } from '../components/MapView.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { useGeolocation } from '../hooks/useGeolocation.js';
import { useSession } from '../hooks/useSession.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { copy } from '../i18n.js';

const FAKE_ALLOWED = import.meta.env.DEV && import.meta.env.VITE_DEV_FAKE_LOCATION === 'true';

/** Message for each way a location check can end without a verified result. */
const MESSAGES = {
  outside_radius: copy.map.outside,
  poor_accuracy: copy.map.poor,
  denied: copy.map.denied,
  unavailable: copy.map.unavailable,
  timeout: copy.map.timeout,
};

function CheckpointStatus({ checkpoint }) {
  if (checkpoint.completed) return <span className="chip chip--mint">{copy.map.completed}</span>;
  if (!checkpoint.isActive) return <span className="chip chip--grey">{copy.map.inactive}</span>;
  return <span className="chip chip--grey">{copy.map.attempt(checkpoint.nextAttemptNumber)}</span>;
}

function LocationCheck({ checkpoint, active }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { student, refresh } = useSession();
  const { locate, busy } = useGeolocation();
  const [outcome, setOutcome] = useState(null);
  const [starting, setStarting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pretend, setPretend] = useState(false);

  // A different checkpoint starts from a clean slate.
  useEffect(() => setOutcome(null), [checkpoint.id]);

  const check = useCallback(async () => {
    setOutcome(null);
    const fake = pretend
      ? { latitude: checkpoint.latitude, longitude: checkpoint.longitude, accuracy: 10 }
      : undefined;
    const { sample, failure } = await locate(fake);
    if (failure) {
      setOutcome(failure);
      return;
    }
    try {
      const result = await api.locationCheck(checkpoint.id, sample);
      setOutcome(result.outcome);
    } catch (error) {
      if (error.code === 'ACTIVE_ATTEMPT_EXISTS') {
        navigate(`/quiz/${error.details.attemptId}`);
        return;
      }
      toast.error(errorText(error));
    }
  }, [checkpoint, locate, navigate, pretend, toast]);

  const begin = async () => {
    if (!student.locationConsent) {
      setAsking(true);
      return;
    }
    await check();
  };

  const accept = async () => {
    try {
      await api.consent();
      await refresh();
      setAsking(false);
      await check();
    } catch (error) {
      setAsking(false);
      toast.error(errorText(error));
    }
  };

  const start = async () => {
    setStarting(true);
    try {
      const { attempt } = await api.startAttempt(checkpoint.id);
      navigate(`/quiz/${attempt.id}`);
    } catch (error) {
      if (error.code === 'ACTIVE_ATTEMPT_EXISTS') {
        navigate('/map');
      } else if (error.code === 'LOCATION_NOT_VERIFIED') {
        setOutcome(null);
      }
      toast.error(errorText(error));
    } finally {
      setStarting(false);
    }
  };

  if (checkpoint.completed) return <p>{copy.map.completed}.</p>;
  if (!checkpoint.isActive) return <p className="muted">{copy.map.inactive}.</p>;
  if (active) return null;

  return (
    <div className="stack">
      {outcome === 'verified' ? (
        <>
          <p className="check-ok" role="status">
            <Icon name="check" /> {copy.map.verified}
          </p>
          <p className="field__hint">{copy.map.tooFar}</p>
          <Button block busy={starting} onClick={start}>
            {copy.map.startQuiz}
          </Button>
        </>
      ) : (
        <>
          {outcome && (
            <p className="check-bad" role="alert">
              <Icon name="warn" /> {MESSAGES[outcome]}
            </p>
          )}
          <Button block busy={busy} onClick={begin}>
            <Icon name="locate" />
            {busy ? copy.map.checking : copy.map.check}
          </Button>
          {FAKE_ALLOWED && (
            <label className="row field__hint">
              <input
                type="checkbox"
                checked={pretend}
                onChange={(event) => setPretend(event.target.checked)}
              />
              {copy.map.fakeHere}
            </label>
          )}
        </>
      )}
      {asking && (
        <Sheet title={copy.map.consentTitle} light onClose={() => setAsking(false)}>
          <p>{copy.map.consentBody}</p>
          <div className="row sheet__actions">
            <Button data-autofocus onClick={accept}>
              {copy.map.consentAccept}
            </Button>
            <Button variant="quiet" onClick={() => setAsking(false)}>
              {copy.map.consentDecline}
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

export default function MapPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { student } = useSession();
  const [params, setParams] = useSearchParams();
  const [checkpoints, setCheckpoints] = useState([]);
  const [active, setActive] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([api.checkpoints(), api.activeAttempt()])
      .then(([list, current]) => {
        if (!alive) return;
        setCheckpoints(list.checkpoints);
        setActive(current.attempt);
      })
      .catch((error) => {
        if (!alive) return;
        setFailed(true);
        toast.error(errorText(error));
      });
    return () => {
      alive = false;
    };
  }, [toast]);

  const selectedId = Number(params.get('cp')) || null;
  const selected = checkpoints.find((c) => c.id === selectedId) ?? null;
  const select = useCallback(
    (id) => setParams(id ? { cp: String(id) } : {}, { replace: true }),
    [setParams],
  );

  return (
    <div className="mapscreen">
      <MapView checkpoints={checkpoints} selectedId={selectedId} onSelect={select} />
      <header className="mapscreen__bar">
        <h1 className="display mapscreen__title">{copy.map.title}</h1>
        {student && (
          <span className="chip chip--volt">{student.totalPoints.toLocaleString('en')} PTS</span>
        )}
      </header>

      <aside className="mapscreen__panel panel" aria-label="Checkpoint">
        {active && (
          <div className="stack resume">
            <p>
              <strong>{copy.map.resumeQuiz}</strong> {active.checkpointName}
            </p>
            <Button block onClick={() => navigate(`/quiz/${active.id}`)}>
              {copy.map.resume}
            </Button>
          </div>
        )}
        {failed && <p className="field__error">{copy.map.loadFailed}</p>}
        {selected ? (
          <div className="stack">
            <div className="row panel__top">
              <h2>{selected.name}</h2>
              <CheckpointStatus checkpoint={selected} />
            </div>
            <LocationCheck checkpoint={selected} active={Boolean(active)} />
            <Button variant="quiet" small onClick={() => select(null)}>
              All checkpoints
            </Button>
          </div>
        ) : (
          !active && (
            <div className="stack stack--tight">
              <p>{copy.map.pick}</p>
              <ul className="cplist">
                {checkpoints.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="cplist__item" onClick={() => select(c.id)}>
                      <span>{c.name}</span>
                      <CheckpointStatus checkpoint={c} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        )}
      </aside>
    </div>
  );
}
