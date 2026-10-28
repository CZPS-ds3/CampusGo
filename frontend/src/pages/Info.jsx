import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Button } from '../components/Button.jsx';
import { Carousel } from '../components/Carousel.jsx';
import { Icon, IconButton } from '../components/icons.jsx';
import { Skeleton } from '../components/Screen.jsx';
import { Display } from '../components/ui.jsx';
import { formatClock } from '../hooks/useServerTimer.js';
import { useToast } from '../hooks/useToast.jsx';
import { t } from '../i18n.js';

/**
 * Read-first page before the location check (Should item, R-62). No timer runs here: the quiz unlocks
 * and its timer starts only when the location check that follows succeeds (BR12, BR13).
 */
export default function Info() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [checkpoint, setCheckpoint] = useState(null);
  const heading = useRef(null);

  useEffect(() => {
    let alive = true;
    api
      .checkpoints()
      .then(({ checkpoints }) => {
        if (!alive) return;
        const found = checkpoints.find((c) => c.id === Number(id));
        if (found) setCheckpoint(found);
        else navigate('/map', { replace: true });
      })
      .catch((error) => alive && toast.error(errorText(error)));
    return () => {
      alive = false;
    };
  }, [id, navigate, toast]);

  useEffect(() => {
    if (checkpoint) heading.current?.focus({ preventScroll: true });
  }, [checkpoint]);

  const ready = () => navigate(`/locate/${checkpoint.id}`);

  if (!checkpoint) {
    return (
      <main className="page page--narrow">
        <Skeleton rows={3} />
      </main>
    );
  }

  return (
    <main className="page page--narrow">
      <div className="row">
        <IconButton icon="back" label={t('Back to map')} onClick={() => navigate('/map')} />
      </div>
      <Display as="h1" size="h1" ref={heading} tabIndex={-1} className="mt block">
        {checkpoint.name}
      </Display>
      <div className="mt">
        <Carousel
          images={checkpoint.images ?? []}
          label={t('Photos of {name}', { name: checkpoint.name })}
        />
      </div>
      <p className="muted mt-s">{t('Read these first. No timer is running yet.')}</p>
      <ol className="facts">
        {checkpoint.facts.map((fact, i) => (
          <li key={i} className="card row">
            <span className="display h2 accent">{i + 1}</span>
            <p className="grow">{fact}</p>
          </li>
        ))}
      </ol>
      <div className="card card--flat row row--between">
        <span className="caption muted">
          {checkpoint.questionCount} {t('questions')} · {t('pass')} {checkpoint.passThreshold}/
          {checkpoint.questionCount}
        </span>
        <span className="mono">{formatClock(checkpoint.questionCount * 60)}</span>
      </div>
      <Button className="mt" onClick={ready}>
        {t("I'm ready")} <Icon name="arrow" />
      </Button>
    </main>
  );
}
