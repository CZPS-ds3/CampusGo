import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Button } from '../components/Button.jsx';
import { Icon } from '../components/icons.jsx';
import { Page, Skeleton } from '../components/Screen.jsx';
import { Chip, Display } from '../components/ui.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { formatNumber, t } from '../i18n.js';

const COUNT_MS = 1200;

/** Counts from 0 up to `target` (instantly when the person prefers reduced motion). */
function useCount(target) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return undefined;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / COUNT_MS);
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

function Passed({ result, name }) {
  const shown = useCount(result.pointsEarned);
  const rows = [
    [
      t('Correct answers ({c}/{n})', { c: result.correctCount, n: result.questionCount }),
      formatNumber(result.basePoints),
    ],
    [t('Time bonus'), `+${formatNumber(result.timeBonus)}`],
    [t('Full clear'), result.fullClearBonus ? `+${formatNumber(result.fullClearBonus)}` : '–'],
    [t('Attempt {n} multiplier', { n: result.attemptNumber }), `×${result.multiplierPercent}%`],
  ];
  return (
    <>
      <Chip tone="ok" icon="check">
        {t('Pass')} {result.correctCount}/{result.questionCount}
      </Chip>
      <Display as="p" size="h1" className="block mt-s">
        {name}
      </Display>
      <div className="result__hero">
        <span className="pill pill--ok anim-pop" style={{ animationDelay: '500ms' }}>
          <Icon name="check" size={16} />
          <span className="caption">{t('Checkpoint cleared')}</span>
        </span>
        <p className="caption muted">{t('Points earned')}</p>
        <p className="mono result__score accent" aria-label={formatNumber(result.pointsEarned)}>
          {formatNumber(shown)}
        </p>
      </div>
      <div className="card result__rows">
        {rows.map(([label, value], k) => (
          <div
            key={label}
            className="result__row"
            style={{ animation: `countIn 400ms ${200 + k * 120}ms both` }}
          >
            <span className="small muted">{label}</span>
            <span className="mono">{value}</span>
          </div>
        ))}
        <div className="result__row result__row--total">
          <span className="caption">{t('Total (rounded up)')}</span>
          <span className="mono h2">{formatNumber(result.pointsEarned)}</span>
        </div>
      </div>
      {result.multiplierPercent === 0 && (
        <p className="small muted">{t('From attempt 6 on, a checkpoint earns 0 points.')}</p>
      )}
      <div
        className="card card--flat row row--between anim-pop"
        style={{ animationDelay: '900ms' }}
      >
        <span className="caption muted">{t('Rank')}</span>
        <span className="mono h2 row">
          <span className="muted">#{result.rankBefore}</span>
          <Icon name="arrow" size={20} />
          <span>#{result.rankAfter}</span>
        </span>
      </div>
    </>
  );
}

function Failed({ result }) {
  const expired = result.endReason === 'expired';
  return (
    <>
      <Chip tone="warn" icon="warn">
        {expired ? t('Time is up') : t('Not this time')}
      </Chip>
      <Display as="p" size="h1" className="block mt-s">
        {t('Almost there')}
      </Display>
      <p className="muted">
        {expired
          ? t('The timer ran out.')
          : t('You got {c} of {n} right. You need {p}.', {
              c: result.correctCount,
              n: result.questionCount,
              p: result.passThreshold,
            })}{' '}
        {t('You can try this checkpoint again.')}
      </p>
      <div className="card row row--between">
        <div>
          <p className="caption muted">{t('Attempt used')}</p>
          <p className="mono result__small">{result.attemptNumber}</p>
        </div>
        <div className="result__next">
          <p className="caption muted">{t('Next attempt pays')}</p>
          <p className="mono h2 accent">{result.nextMultiplierPercent}%</p>
        </div>
      </div>
      {result.nextMultiplierPercent === 0 && (
        <p className="small warn-text">{t('From attempt 6 on, a checkpoint earns 0 points.')}</p>
      )}
    </>
  );
}

export default function Result() {
  const { id } = useParams();
  const { refresh } = useSession();
  const [result, setResult] = useState(null);
  const [checkpointName, setCheckpointName] = useState('');
  const [error, setError] = useState('');
  const heading = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { result: loaded } = await api.result(id);
        const { checkpoints } = await api.checkpoints();
        if (!alive) return;
        setResult(loaded);
        setCheckpointName(checkpoints.find((c) => c.id === loaded.checkpointId)?.name ?? '');
        await refresh(); // the player card shows the new total
      } catch (failure) {
        if (alive) setError(errorText(failure));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, refresh]);

  useEffect(() => {
    if (result) heading.current?.focus({ preventScroll: true });
  }, [result]);

  return (
    <Page className="page--narrow">
      {error && <p className="field-note field-note--error">{error}</p>}
      {!result && !error && <Skeleton rows={3} height={110} />}
      {result && (
        <section className="stack" aria-labelledby="result-title">
          <h1 id="result-title" ref={heading} tabIndex={-1} className="sr-only">
            {result.passed ? t('Pass') : t('Not this time')} · {checkpointName}
          </h1>
          {result.passed ? (
            <Passed result={result} name={checkpointName} />
          ) : (
            <Failed result={result} />
          )}
          <div className="stack mt">
            {!result.passed && !result.checkpointCompleted && (
              <Button variant="dark" to={`/locate/${result.checkpointId}`}>
                <Icon name="refresh" /> {t('Try again')}
              </Button>
            )}
            <Button variant={result.passed ? undefined : 'ghost'} to="/map">
              {t('Back to map')}
            </Button>
            {result.passed && (
              <Button variant="ghost" to="/quests">
                {t('See quests')}
              </Button>
            )}
          </div>
        </section>
      )}
    </Page>
  );
}
