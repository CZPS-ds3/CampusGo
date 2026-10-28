import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { errorText } from '../../api/errorText.js';
import { Button } from '../../components/Button.jsx';
import { Icon } from '../../components/icons.jsx';
import { Skeleton } from '../../components/Screen.jsx';
import { Chip, Display } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { t } from '../../i18n.js';

/** Every checkpoint, open or not, with a button that starts its quiz without being there. */
export default function AdminTestQuests() {
  const toast = useToast();
  const [checkpoints, setCheckpoints] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .checkpoints()
      .then((result) => alive && setCheckpoints(result.checkpoints))
      .catch((error) => alive && toast.error(errorText(error)));
    return () => {
      alive = false;
    };
  }, [toast]);

  return (
    <section className="stack" aria-labelledby="test-title">
      <Display as="h2" size="h2" id="test-title">
        {t('Test quests')}
      </Display>
      <p className="card card--flat row">
        <Icon name="compass" />
        <span className="small">
          {t(
            'Test mode: you can start any quiz from anywhere. You answer the real questions with the real timer; earlier tests of the same checkpoint are cleared.',
          )}
        </span>
      </p>
      {!checkpoints && <Skeleton rows={4} height={80} />}
      <ul className="admin-list">
        {checkpoints?.map((c) => (
          <li key={c.id} className="card stack stack--tight">
            <div className="row row--between">
              <span className="strong">{c.name}</span>
              <Chip tone={c.isActive ? 'ok' : 'mute'}>
                {c.isActive ? t('Open') : t('Not open yet')}
              </Chip>
            </div>
            <p className="small muted">
              {c.questionCount} {t('questions')} · {t('pass')} {c.passThreshold}/{c.questionCount}
            </p>
            <Button small to={`/locate/${c.id}`}>
              {t('Test quiz')} <Icon name="arrow" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
