import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Button } from '../components/Button.jsx';
import { Icon } from '../components/icons.jsx';
import { Page, Skeleton } from '../components/Screen.jsx';
import { Chip, Display, EmptyState } from '../components/ui.jsx';
import { t } from '../i18n.js';

const FILTERS = ['all', 'new', 'retry', 'cleared'];

/** A checkpoint is cleared, or started before (retry), or not played yet (new). Closed ones count as new. */
const statusOf = (c) => (c.completed ? 'cleared' : c.attemptsUsed > 0 ? 'retry' : 'new');

export default function Quests() {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
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
  const list = items?.filter((c) => filter === 'all' || statusOf(c) === filter) ?? [];

  return (
    <Page title={t('Quests')} wide>
      {error && <p className="field-note field-note--error">{error}</p>}
      {!items && !error && <Skeleton rows={4} />}
      {items && (
        <>
          <p className="mono accent" role="status">
            {done}/{items.length} <span className="caption muted">{t('cleared')}</span>
          </p>
          <div className="tabs tabs--4" role="tablist" aria-label={t('Filter quests')}>
            {FILTERS.map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                className="tab caption"
                aria-selected={filter === k}
                onClick={() => setFilter(k)}
              >
                {t(k)}
              </button>
            ))}
          </div>
          {list.length === 0 && (
            <EmptyState
              icon="quests"
              title={t('Nothing here')}
              body={t('No {f} quests right now. Try another filter.', { f: t(filter) })}
              action={
                <Button small variant="ghost" onClick={() => setFilter('all')}>
                  {t('Show all')}
                </Button>
              }
            />
          )}
          <ul className="quests">
            {list.map((c) => {
              const status = statusOf(c);
              return (
                <li key={c.id}>
                  <Link to={`/map?cp=${c.id}`} className="card quest">
                    <span
                      className={`diamond diamond--${c.isActive || c.completed ? status : 'closed'}`}
                    >
                      <span>
                        <Icon
                          name={status === 'cleared' ? 'check' : c.isActive ? 'pin' : 'lock'}
                          size={22}
                        />
                      </span>
                    </span>
                    <span className="grow quest__text">
                      <Display as="span" size="h3" className="block">
                        {c.name}
                      </Display>
                      <span className="small muted block">
                        {c.questionCount} {t('questions')} · {t('pass')} {c.passThreshold}/
                        {c.questionCount}
                      </span>
                      <span className="small muted block">
                        {t('Attempts used:')} <b className="mono quest__n">{c.attemptsUsed}</b>
                      </span>
                    </span>
                    <Chip tone={status === 'cleared' ? 'ok' : status === 'retry' ? 'warn' : 'sub'}>
                      {c.isActive || c.completed ? t(status) : t('Not open yet')}
                    </Chip>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Page>
  );
}
