import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Button } from '../components/Button.jsx';
import { Icon, IconButton } from '../components/icons.jsx';
import { OfflineBanner, useOnline } from '../components/OfflineBanner.jsx';
import { Modal } from '../components/Sheet.jsx';
import { Chip, Display } from '../components/ui.jsx';
import { formatClock, useServerTimer } from '../hooks/useServerTimer.js';
import { formatNumber, t } from '../i18n.js';

const LETTERS = ['A', 'B', 'C', 'D'];
const URGENT_SECONDS = 30;
const PULSE_SECONDS = 10;
const MAX_RETRIES = 3;

function Timer({ seconds }) {
  const urgent = seconds < URGENT_SECONDS;
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (seconds === URGENT_SECONDS) setAnnouncement(t('30 seconds left'));
    else if (seconds === PULSE_SECONDS) setAnnouncement(t('10 seconds left'));
    else if (seconds === 0) setAnnouncement(t('Time is up'));
  }, [seconds]);

  return (
    <>
      <div
        className={`timer mono${urgent ? ' is-urgent' : ''}${seconds < PULSE_SECONDS ? ' timer-pulse' : ''}`}
        role="timer"
        aria-live="off"
        aria-label={t('Time left {time}', { time: formatClock(seconds) })}
      >
        <Icon name="clock" size={20} />
        {formatClock(seconds)}
      </div>
      <span className="sr-only" role="status" aria-live="assertive">
        {announcement}
      </span>
    </>
  );
}

function Option({ option, index, state, disabled, multi, onPick }) {
  return (
    <li>
      <button
        type="button"
        className={`opt${multi ? ' opt--multi' : ''}${state ? ` is-${state}` : ''}${state === 'wrong' ? ' anim-shake' : ''}`}
        aria-disabled={disabled || undefined}
        aria-pressed={multi ? state === 'ticked' : undefined}
        onClick={() => onPick(option.id)}
      >
        <span className="opt__key display h3" aria-hidden="true">
          {LETTERS[index]}
        </span>
        <span className="opt__text">{option.text}</span>
        {state === 'correct' && <Icon name="check" title={t('Right answer')} />}
        {state === 'wrong' && <Icon name="close" title={t('Your answer')} />}
        {state === 'ticked' && <Icon name="check" title={t('Selected')} />}
        {state === 'pending' && <span className="spinner" aria-label={t('Saving…')} />}
      </button>
    </li>
  );
}

export default function Quiz() {
  const { id } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const [attempt, setAttempt] = useState(null);
  const [shown, setShown] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [ticked, setTicked] = useState([]);
  const [layer, setLayer] = useState(null);
  const [hardOpen, setHardOpen] = useState(false);
  const [retries, setRetries] = useState(0);
  const [retryIds, setRetryIds] = useState(null);
  const inFlight = useRef(false);
  const nextButton = useRef(null);
  const expiredButton = useRef(null);

  const { seconds, remainingMs } = useServerTimer(attempt?.expiresAt, attempt?.serverNow);

  const load = useCallback(async () => {
    try {
      const { attempt: loaded } = await api.attempt(id);
      if (loaded.status !== 'active') {
        navigate(`/result/${loaded.id}`, { replace: true });
        return;
      }
      setAttempt(loaded);
      setShown(loaded.currentQuestion);
      setLayer(null);
      const lastSlot = loaded.questions[loaded.questionCount - 1];
      if (
        loaded.hardUnlocked &&
        !loaded.hardAccepted &&
        loaded.currentQuestion === loaded.questionCount &&
        lastSlot &&
        !lastSlot.answered
      ) {
        setHardOpen(true);
      }
    } catch (error) {
      if (error.status === 404) navigate('/map', { replace: true });
      else setLayer({ kind: 'error', message: errorText(error) });
    }
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  // The server decides when time is up; the client only notices that its clock reached the deadline.
  const expired = attempt && attempt.status === 'active' && remainingMs === 0 && seconds === 0;
  useEffect(() => {
    if (expired) {
      setHardOpen(false);
      setLayer({ kind: 'expired' });
    }
  }, [expired]);

  useEffect(() => {
    if (layer?.kind === 'expired') expiredButton.current?.focus();
  }, [layer]);

  useEffect(() => {
    if (feedback) nextButton.current?.focus();
  }, [feedback]);

  const submit = useCallback(
    async (optionIds) => {
      if (inFlight.current || feedback || !online || layer || hardOpen || !attempt) return;
      inFlight.current = true;
      setPendingId(optionIds.length === 1 ? optionIds[0] : -2);
      try {
        const response = await api.answer(attempt.id, optionIds, shown);
        setAttempt(response.attempt);
        setFeedback({
          pickedIds: optionIds,
          correct: response.correct,
          correctOptionIds: response.correctOptionIds ?? [],
          result: response.result ?? null,
        });
        setRetries(0);
      } catch (error) {
        if (error.code === 'ATTEMPT_EXPIRED' || error.code === 'ATTEMPT_NOT_ACTIVE') {
          setLayer({ kind: 'expired' });
        } else {
          setRetries((n) => n + 1);
          setLayer({ kind: 'error', message: errorText(error), optionIds });
        }
      } finally {
        inFlight.current = false;
        setPendingId(null);
      }
    },
    [attempt, feedback, hardOpen, layer, online, shown],
  );

  // A retry waits until the error layer is gone, so `submit` sees the cleared state.
  useEffect(() => {
    if (retryIds && !layer) {
      setRetryIds(null);
      submit(retryIds);
    }
  }, [retryIds, layer, submit]);

  const next = () => {
    if (!feedback) return;
    if (feedback.result || attempt.status !== 'active') {
      navigate(`/result/${attempt.id}`, { replace: true });
      return;
    }
    const upcoming = attempt.currentQuestion;
    setFeedback(null);
    setTicked([]);
    setShown(upcoming);
    if (upcoming === attempt.questionCount && attempt.hardUnlocked && !attempt.hardAccepted)
      setHardOpen(true);
  };

  const goHard = async () => {
    setPendingId(-1);
    try {
      const { attempt: updated } = await api.acceptHard(attempt.id);
      setAttempt(updated);
      setHardOpen(false);
    } catch (error) {
      setHardOpen(false);
      setLayer(
        error.code === 'ATTEMPT_EXPIRED'
          ? { kind: 'expired' }
          : { kind: 'error', message: errorText(error) },
      );
    } finally {
      setPendingId(null);
    }
  };

  if (!attempt) {
    return (
      <main className="page page--narrow">
        {layer?.kind === 'error' ? (
          <div className="card stack" role="alert">
            <Display as="h1" size="h2">
              {t('Something went wrong')}
            </Display>
            <p>{layer.message}</p>
            <Button onClick={load}>{t('Try again')}</Button>
            <Button variant="ghost" to="/map">
              {t('Back to map')}
            </Button>
          </div>
        ) : (
          <p role="status" aria-busy="true" className="muted">
            {t('Loading your question…')}
          </p>
        )}
      </main>
    );
  }

  const question = attempt.questions.find((q) => q.number === shown) ?? attempt.questions[0];
  const total = attempt.questionCount;
  const locked = Boolean(pendingId || feedback || !online || layer || hardOpen);
  const isHard = question.difficulty === 'HARD';
  const multi = question.type === 'MULTI';
  // A multi-select question is answered with the Check button; a single-choice one by tapping an option.
  const pickOption = (optionId) => {
    if (!multi) {
      submit([optionId]);
      return;
    }
    if (locked) return;
    setTicked((now) =>
      now.includes(optionId) ? now.filter((x) => x !== optionId) : [...now, optionId],
    );
  };
  const stateOf = (option) => {
    if (pendingId === option.id) return 'pending';
    if (!feedback) return ticked.includes(option.id) ? 'ticked' : null;
    const picked = feedback.pickedIds.includes(option.id);
    const right = feedback.correct ? picked : feedback.correctOptionIds.includes(option.id);
    if (picked) return right ? 'correct' : 'wrong';
    return right ? 'correct' : 'dim';
  };
  const lastQuestion = feedback && (feedback.result || attempt.status !== 'active');

  if (hardOpen && layer?.kind !== 'expired') {
    return (
      <main className="bonus">
        <div className="halftone bonus__dots" aria-hidden="true" />
        <div className="bonus__inner anim-pop">
          <Chip tone="accent" icon="bolt">
            {t('Perfect so far')}
          </Chip>
          <Display as="h1" size="h1" className="accent block mt-s" tabIndex={-1} data-autofocus>
            {t('Bonus')}
            <br />
            {t('round')}
          </Display>
          <p>
            {t('Q1–{n} all correct on your first try. Swap Q{last} for one hard question worth', {
              n: attempt.questionCount - 1,
              last: attempt.questionCount,
            })}{' '}
            <b className="mono accent">{formatNumber(2000)}</b>.
          </p>
          <p className="small muted">{t('Timer keeps running. One shot, no retry.')}</p>
          <p className="risk small">
            <Icon name="warn" />
            {t(
              'You already have {n} of {total} right, so you have passed. A hard question is worth 2,000 instead of 1,000. If you get it wrong you lose the 1,000 for question {total} and the 200 full-clear bonus. You cannot switch back, and the clock keeps running.',
              { n: attempt.questionCount - 1, total: attempt.questionCount },
            )}
          </p>
          <div className="stack mt">
            <Button variant="dark" busy={pendingId === -1} onClick={goHard}>
              {t('Accept bonus')} <Icon name="bolt" />
            </Button>
            <Button variant="ghost" onClick={() => setHardOpen(false)}>
              {t('Decline, normal question')}
            </Button>
          </div>
        </div>
        <Timer seconds={seconds} />
      </main>
    );
  }

  return (
    <>
      <OfflineBanner message={t('You are offline. The server clock keeps running.')} />
      <main className="quiz">
        <header className="quiz__head">
          <IconButton icon="back" label={t('Back (disabled during quiz)')} disabled />
          <h1 className="display h3 grow quiz__count" title={attempt.checkpointName}>
            <span className="sr-only">{attempt.checkpointName}. </span>
            <span aria-label={t('Question {n} of {total}', { n: question.number, total })}>
              {t('Q')} {question.number}/{total}
            </span>
          </h1>
          <Timer seconds={seconds} />
        </header>

        <ol className="segments" aria-label={t('Questions')}>
          {attempt.questions.map((q) => (
            <li
              key={q.number}
              className={`segment${
                q.answered
                  ? q.correct
                    ? ' is-ok'
                    : ' is-bad'
                  : q.number === shown
                    ? ' is-now'
                    : ''
              }`}
              aria-label={t('Question {n}', { n: q.number })}
            />
          ))}
        </ol>

        <p className="caption muted quiz__meta">
          {attempt.checkpointName} · {t('Attempt {n} multiplier', { n: attempt.attemptNumber })} ×
          {attempt.multiplierPercent}%
        </p>

        {layer?.kind === 'error' ? (
          <div className="card stack" role="alert">
            <Display as="h2" size="h2">
              {t('Something went wrong')}
            </Display>
            <p>{layer.message}</p>
            <Button
              onClick={() => {
                const again = layer.optionIds;
                setLayer(null);
                if (again) setRetryIds(again);
                else load();
              }}
            >
              {t('Try again')}
            </Button>
            {retries >= MAX_RETRIES && (
              <Button variant="ghost" to="/map">
                {t('Back to map')}
              </Button>
            )}
          </div>
        ) : (
          <>
            <section
              key={question.number}
              className="card panel-accent anim-pop"
              aria-labelledby="question-text"
            >
              {isHard && <p className="caption accent">{t('Bonus · worth 2,000')}</p>}
              <h2 id="question-text" className="quiz__question">
                {question.text}
              </h2>
              <p className="caption muted">
                {multi ? t('Choose all that apply') : t('Choose one answer')}
              </p>
            </section>
            <ul className="options">
              {question.options.map((option, index) => (
                <Option
                  key={option.id}
                  option={option}
                  index={index}
                  state={stateOf(option)}
                  disabled={locked}
                  multi={multi}
                  onPick={pickOption}
                />
              ))}
            </ul>
            {multi && !feedback && (
              <Button
                variant="sub"
                busy={pendingId === -2}
                disabled={ticked.length === 0 || locked}
                onClick={() => submit(ticked)}
              >
                {t('Check answer')} <Icon name="check" />
              </Button>
            )}
            <div className="quiz__feedback" role="status" aria-live="polite">
              {feedback && (
                <p className={`feedback ${feedback.correct ? 'is-right' : 'is-wrong'}`}>
                  <Icon name={feedback.correct ? 'check' : 'close'} />
                  {feedback.correct ? t('Correct!') : `${t('Not quite.')} ${t('Right answer')}.`}
                </p>
              )}
            </div>
            {feedback && (
              <Button ref={nextButton} variant="sub" className="anim-pop" onClick={next}>
                {lastQuestion ? t('Finish') : t('Next')} <Icon name="arrow" />
              </Button>
            )}
          </>
        )}
      </main>

      {layer?.kind === 'expired' && (
        <Modal title={t('Time is up')}>
          <Display as="h2" size="h2">
            {t('Time is up')}
          </Display>
          <p className="mono h1">0:00</p>
          <p className="muted">{t('The clock ran out. Your answers so far count.')}</p>
          <Button
            ref={expiredButton}
            className="mt"
            onClick={() => navigate(`/result/${attempt.id}`, { replace: true })}
          >
            {t('See result')}
          </Button>
        </Modal>
      )}
    </>
  );
}
