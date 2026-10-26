import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Button } from '../components/Button.jsx';
import { Icon } from '../components/icons.jsx';
import { OfflineBanner, useOnline } from '../components/OfflineBanner.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { formatClock, useServerTimer } from '../hooks/useServerTimer.js';
import { useSession } from '../hooks/useSession.jsx';
import { copy } from '../i18n.js';

const LETTERS = ['A', 'B', 'C', 'D'];
const URGENT_SECONDS = 30;
const SECONDS_PER_QUESTION = 60;
const MAX_RETRIES = 3;

function Countdown({ seconds, totalSeconds }) {
  const urgent = seconds <= URGENT_SECONDS;
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (seconds === URGENT_SECONDS) setAnnouncement('30 seconds left');
    else if (seconds === 10) setAnnouncement('10 seconds left');
    else if (seconds === 0) setAnnouncement('Time is up');
  }, [seconds]);

  return (
    <>
      <span
        className={`timer${urgent ? ' is-urgent' : ''}`}
        role="timer"
        aria-live="off"
        aria-label="Time left"
      >
        <Icon name={urgent ? 'alarm' : 'clock'} />
        <span>{formatClock(seconds)}</span>
        <span className="timer__tag" aria-hidden="true">
          {copy.quiz.hurry}
        </span>
      </span>
      <span className="sr-only" role="status" aria-live="assertive">
        {announcement}
      </span>
      <div className={`timebar${urgent ? ' is-urgent' : ''}`} aria-hidden="true">
        <div
          className="timebar__fill"
          style={{ transform: `scaleX(${Math.min(1, seconds / totalSeconds)})` }}
        />
      </div>
    </>
  );
}

function Option({ option, index, state, disabled, onPick }) {
  return (
    <li>
      <button
        type="button"
        className={`opt${state ? ` is-${state}` : ''}`}
        aria-disabled={disabled || undefined}
        onClick={() => onPick(option.id)}
      >
        <span className="opt__key" aria-hidden="true">
          {LETTERS[index]}
        </span>
        <span>{option.text}</span>
        <span className="opt__tag">
          {state === 'correct' && <Icon name="check" title={copy.quiz.rightAnswer} />}
          {state === 'wrong' && <Icon name="cross" title={copy.quiz.yourAnswer} />}
          {state === 'pending' && (
            <span
              className="spinner"
              style={{ width: 20, height: 20 }}
              aria-label={copy.quiz.saving}
            />
          )}
        </span>
      </button>
    </li>
  );
}

export default function Quiz() {
  const { id } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const { student } = useSession();
  const [attempt, setAttempt] = useState(null);
  const [shown, setShown] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [layer, setLayer] = useState(null);
  const [hardOpen, setHardOpen] = useState(false);
  const [hardConfirm, setHardConfirm] = useState(false);
  const [retries, setRetries] = useState(0);
  const [retryOption, setRetryOption] = useState(null);
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
      const fifth = loaded.questions[4];
      if (
        loaded.hardUnlocked &&
        !loaded.hardAccepted &&
        loaded.currentQuestion === 5 &&
        fifth &&
        !fifth.answered
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
    if (expired) setLayer({ kind: 'expired' });
  }, [expired]);

  useEffect(() => {
    if (layer?.kind === 'expired') expiredButton.current?.focus();
  }, [layer]);

  useEffect(() => {
    if (feedback) nextButton.current?.focus();
  }, [feedback]);

  const pick = useCallback(
    async (optionId) => {
      if (inFlight.current || feedback || !online || layer || hardOpen || !attempt) return;
      inFlight.current = true;
      setPendingId(optionId);
      try {
        const response = await api.answer(attempt.id, optionId, shown);
        setAttempt(response.attempt);
        setFeedback({
          pickedId: optionId,
          correct: response.correct,
          correctOptionId: response.correctOptionId,
          result: response.result ?? null,
        });
        setRetries(0);
      } catch (error) {
        if (error.code === 'ATTEMPT_EXPIRED' || error.code === 'ATTEMPT_NOT_ACTIVE') {
          setLayer({ kind: 'expired' });
        } else {
          setRetries((n) => n + 1);
          setLayer({ kind: 'error', message: errorText(error), optionId });
        }
      } finally {
        inFlight.current = false;
        setPendingId(null);
      }
    },
    [attempt, feedback, hardOpen, layer, online, shown],
  );

  // A retry waits until the error layer is gone, so `pick` sees the cleared state.
  useEffect(() => {
    if (retryOption && !layer) {
      setRetryOption(null);
      pick(retryOption);
    }
  }, [retryOption, layer, pick]);

  const next = () => {
    if (!feedback) return;
    if (feedback.result || attempt.status !== 'active') {
      navigate(`/result/${attempt.id}`, { replace: true });
      return;
    }
    const upcoming = attempt.currentQuestion;
    setFeedback(null);
    setShown(upcoming);
    if (upcoming === 5 && attempt.hardUnlocked && !attempt.hardAccepted) setHardOpen(true);
  };

  const goHard = async () => {
    setPendingId(-1);
    try {
      const { attempt: updated } = await api.acceptHard(attempt.id);
      setAttempt(updated);
      setHardOpen(false);
      setHardConfirm(false);
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
      <div className="quiz">
        <div className="quiz__card" aria-busy="true">
          {layer?.kind === 'error' ? (
            <>
              <h1 className="display">{copy.quiz.errorTitle}</h1>
              <p>{layer.message}</p>
              <div className="row">
                <Button onClick={load}>{copy.quiz.retry}</Button>
                <Button variant="quiet" to="/map">
                  {copy.quiz.toMap}
                </Button>
              </div>
            </>
          ) : (
            <p role="status">{copy.quiz.loading}</p>
          )}
        </div>
      </div>
    );
  }

  const question = attempt.questions.find((q) => q.number === shown) ?? attempt.questions[0];
  const totalSeconds = attempt.questionCount * SECONDS_PER_QUESTION;
  const locked = Boolean(pendingId || feedback || !online || layer || hardOpen);
  const stateOf = (option) => {
    if (pendingId === option.id) return 'pending';
    if (!feedback) return null;
    if (option.id === feedback.pickedId) return feedback.correct ? 'correct' : 'wrong';
    if (option.id === feedback.correctOptionId) return 'correct';
    return 'dim';
  };
  const lastQuestion = feedback && (feedback.result || attempt.status !== 'active');

  return (
    <>
      <OfflineBanner message={copy.quiz.offline} />
      <div className="quiz">
        <header className="quiz__head">
          <h1 className="quiz__title" title={attempt.checkpointName}>
            {attempt.checkpointName}
          </h1>
          <span
            className="chip quiz__counter"
            aria-label={`Question ${question.number} of ${attempt.questionCount}`}
          >
            {question.number} / {attempt.questionCount}
          </span>
          <Countdown seconds={seconds} totalSeconds={totalSeconds} />
        </header>

        <section className="quiz__card" aria-labelledby="question-text">
          {question.difficulty === 'HARD' && (
            <span className="chip chip--volt quiz__tag">HARD · 2,000</span>
          )}
          {layer?.kind === 'error' ? (
            <div className="stack" role="alert">
              <h2 className="display">{copy.quiz.errorTitle}</h2>
              <p>{layer.message}</p>
              <div className="row">
                <Button
                  onClick={() => {
                    const again = layer.optionId;
                    setLayer(null);
                    if (again) setRetryOption(again);
                    else load();
                  }}
                >
                  {copy.quiz.retry}
                </Button>
                {retries >= MAX_RETRIES && (
                  <Button variant="quiet" to="/map">
                    {copy.quiz.toMap}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <p id="question-text" className="quiz__question">
                {question.text}
              </p>
              <ul className="options">
                {question.options.map((option, index) => (
                  <Option
                    key={option.id}
                    option={option}
                    index={index}
                    state={stateOf(option)}
                    disabled={locked}
                    onPick={pick}
                  />
                ))}
              </ul>
              <div className="feedback-region" role="status" aria-live="polite">
                {feedback && (
                  <p className={`feedback feedback--${feedback.correct ? 'right' : 'wrong'}`}>
                    <Icon name={feedback.correct ? 'check' : 'cross'} />
                    {feedback.correct ? copy.quiz.right : copy.quiz.wrong}
                    {!feedback.correct && ` ${copy.quiz.rightAnswer}.`}
                  </p>
                )}
              </div>
              {feedback && (
                <div className="quiz__next">
                  <Button ref={nextButton} block onClick={next}>
                    {lastQuestion ? copy.quiz.seeResult : copy.quiz.next}
                    <Icon name="arrow" />
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        <aside className="quiz__side" aria-label="Your progress">
          <dl>
            <div>
              <dt>{copy.quiz.points}</dt>
              <dd>{(student?.totalPoints ?? 0).toLocaleString('en')}</dd>
            </div>
            <div>
              <dt>{copy.quiz.attemptLabel}</dt>
              <dd>{attempt.attemptNumber}</dd>
            </div>
            <div>
              <dt>{copy.quiz.multiplier}</dt>
              <dd>{attempt.multiplierPercent}%</dd>
            </div>
          </dl>
          <ol className="dots" aria-label="Questions">
            {attempt.questions.map((q) => {
              const cls = q.answered
                ? q.correct
                  ? 'is-done'
                  : 'is-wrong'
                : q.number === shown
                  ? 'is-current'
                  : '';
              const label = q.answered
                ? q.correct
                  ? 'correct'
                  : 'wrong'
                : q.number === shown
                  ? 'current'
                  : 'to do';
              return (
                <li
                  key={q.number}
                  className={`dot ${cls}`}
                  aria-label={`Question ${q.number}: ${label}`}
                >
                  {q.number}
                </li>
              );
            })}
          </ol>
          <p className="field__hint">{copy.quiz.timeBonus}</p>
        </aside>
      </div>

      {hardOpen && (
        <Sheet title={copy.quiz.hardTitle} locked onClose={() => {}}>
          <div className="hard-choices">
            <button
              type="button"
              className="hard-choice"
              data-autofocus
              onClick={() => setHardOpen(false)}
            >
              <span className="hard-choice__points">1,000</span>
              <strong>{copy.quiz.hardNormal}</strong>
            </button>
            <div className="hard-choice hard-choice--hard">
              <span className="chip chip--volt">HARD</span>
              <span className="hard-choice__points">2,000</span>
              {hardConfirm ? (
                <div className="row">
                  <Button busy={pendingId === -1} onClick={goHard}>
                    {copy.quiz.goHard}
                  </Button>
                  <Button variant="secondary" onClick={() => setHardConfirm(false)}>
                    {copy.quiz.back}
                  </Button>
                </div>
              ) : (
                <Button variant="volt" onClick={() => setHardConfirm(true)}>
                  {copy.quiz.hardHard}
                </Button>
              )}
            </div>
          </div>
          <p className="risk">
            <Icon name="warn" />
            {copy.quiz.hardRisk}
          </p>
        </Sheet>
      )}

      {layer?.kind === 'expired' && (
        <div className="layer" role="alertdialog" aria-modal="true" aria-labelledby="expired-title">
          <h2 id="expired-title">{copy.quiz.expiredTitle}</h2>
          <p className="mono">0:00</p>
          <p>{copy.quiz.expiredBody}</p>
          <Button
            ref={expiredButton}
            onClick={() => navigate(`/result/${attempt.id}`, { replace: true })}
          >
            {copy.quiz.seeResult}
          </Button>
        </div>
      )}
    </>
  );
}
