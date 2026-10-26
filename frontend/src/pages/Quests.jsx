import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Button } from '../components/Button.jsx';
import { Icon } from '../components/icons.jsx';
import { Screen, Skeleton } from '../components/Screen.jsx';
import { copy } from '../i18n.js';

export default function Quests() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .checkpoints()
      .then(({ checkpoints }) => alive && setItems(checkpoints))
      .catch((failure) => alive && setError(errorText(failure)));
    return () => {
      alive = false;
    };
  }, []);

  const done = items?.filter((c) => c.completed).length ?? 0;

  return (
    <Screen title={copy.quests.title} wide>
      {error && <p className="field__error">{error}</p>}
      {!items && !error && <Skeleton rows={4} />}
      {items && (
        <>
          <p className="quests__progress" role="status">
            {copy.quests.progress(done, items.length)}
          </p>
          <ul className="quests">
            {items.map((c) => (
              <li key={c.id} className="quest panel">
                <div className="row quest__top">
                  <h2>{c.name}</h2>
                  {c.completed ? (
                    <span className="chip chip--mint">
                      <Icon name="check" />
                      {copy.quests.done}
                    </span>
                  ) : (
                    <span className="chip chip--grey">
                      {c.isActive ? copy.quests.open : copy.quests.closed}
                    </span>
                  )}
                </div>
                <p className="muted">
                  {c.questionCount} questions · pass with {c.passThreshold}
                  {c.hardQuestionEnabled ? ' · hard question possible' : ''}
                </p>
                <p className="muted">{copy.quests.attempts(c.attemptsUsed)}</p>
                {!c.completed && c.isActive && (
                  <Button variant="quiet" small to={`/map?cp=${c.id}`}>
                    {copy.quests.go}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Screen>
  );
}
