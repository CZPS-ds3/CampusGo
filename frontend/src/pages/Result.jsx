import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Button } from '../components/Button.jsx';
import { Icon } from '../components/icons.jsx';
import { Screen, Skeleton } from '../components/Screen.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { copy } from '../i18n.js';

const fmt = (n) => n.toLocaleString('en');

export default function Result() {
  const { id } = useParams();
  const { refresh } = useSession();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .result(id)
      .then(async ({ result: loaded }) => {
        if (!alive) return;
        setResult(loaded);
        await refresh(); // the header chip shows the new total
      })
      .catch((failure) => alive && setError(errorText(failure)));
    return () => {
      alive = false;
    };
  }, [id, refresh]);

  const title = !result
    ? copy.result.passed
    : result.passed
      ? copy.result.passed
      : result.endReason === 'expired'
        ? copy.result.expired
        : copy.result.failed;

  return (
    <Screen title={result ? title : '…'} wide>
      {error && <p className="field__error">{error}</p>}
      {!result && !error && <Skeleton rows={2} height={120} />}
      {result && (
        <div className="result">
          <section className={`result__hero${result.passed ? ' is-pass' : ''}`} aria-label="Result">
            <Icon name={result.passed ? 'check' : 'cross'} className="result__mark" />
            <p className="result__score mono">+{fmt(result.pointsEarned)}</p>
            <p>
              {result.correctCount} / {result.questionCount} correct · attempt{' '}
              {result.attemptNumber}
            </p>
          </section>

          <section className="panel result__sheet" aria-label="Breakdown">
            <h2>{copy.result.earned}</h2>
            <dl className="breakdown">
              <div>
                <dt>{copy.result.base}</dt>
                <dd className="mono">{fmt(result.basePoints)}</dd>
              </div>
              <div>
                <dt>{copy.result.time}</dt>
                <dd className="mono">+{fmt(result.timeBonus)}</dd>
              </div>
              <div>
                <dt>{copy.result.fullClear}</dt>
                <dd className="mono">+{fmt(result.fullClearBonus)}</dd>
              </div>
              <div>
                <dt>{copy.result.multiplier}</dt>
                <dd className="mono">×{result.multiplierPercent}%</dd>
              </div>
              <div className="breakdown__total">
                <dt>{copy.result.total}</dt>
                <dd className="mono">{fmt(result.totalPoints)}</dd>
              </div>
            </dl>
            {result.passed && result.multiplierPercent === 0 && (
              <p className="muted">{copy.result.zero}</p>
            )}
            <div className="row result__actions">
              <Button to="/map">{copy.result.toMap}</Button>
              {!result.checkpointCompleted && (
                <Button variant="quiet" to={`/map?cp=${result.checkpointId}`}>
                  {copy.result.again}
                </Button>
              )}
              <Button variant="quiet" to="/ranks">
                {copy.result.ranks}
              </Button>
            </div>
          </section>
        </div>
      )}
    </Screen>
  );
}
