import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Avatar } from '../components/Avatar.jsx';
import { Button } from '../components/Button.jsx';
import { Icon } from '../components/icons.jsx';
import { MapView } from '../components/MapView.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { Chip, Display } from '../components/ui.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { formatNumber, t } from '../i18n.js';

function CheckpointSheet({ checkpoint, active, onClose }) {
  const state = checkpoint.completed ? 'done' : checkpoint.isActive ? 'open' : 'closed';
  return (
    <Sheet title={t('{name} checkpoint', { name: checkpoint.name })} onClose={onClose}>
      <div className="row row--between row--top">
        <Display as="h2" size="h2" className="grow">
          {checkpoint.name}
        </Display>
        <Chip
          tone={state === 'done' ? 'ok' : state === 'open' ? 'sub' : 'mute'}
          icon={state === 'done' ? 'check' : state === 'open' ? 'pin' : 'lock'}
        >
          {state === 'done' ? t('Cleared') : state === 'open' ? t('Open') : t('Not open yet')}
        </Chip>
      </div>
      <div className="grid2 mt">
        <div className="card card--tight">
          <p className="caption muted">{t('Questions')}</p>
          <p className="mono h2">{checkpoint.questionCount}</p>
        </div>
        <div className="card card--tight">
          <p className="caption muted">{t('Pass rule')}</p>
          <p className="mono h2">
            {checkpoint.passThreshold}/{checkpoint.questionCount}
          </p>
        </div>
        <div className="card card--tight">
          <p className="caption muted">{t('Best score')}</p>
          <p className="mono h2 accent">
            {checkpoint.bestScore ? formatNumber(checkpoint.bestScore) : '–'}
          </p>
        </div>
        <div className="card card--tight">
          <p className="caption muted">{t('Attempts used:')}</p>
          <p className="mono h2">{checkpoint.attemptsUsed}</p>
        </div>
      </div>
      <p className="small muted mt">
        {t('Timer starts at the first question.')}{' '}
        {t('Leaving the checkpoint later does not end your quiz.')}
      </p>
      {active ? (
        <Button className="mt" to={`/quiz/${active.id}`} data-autofocus>
          {t('Continue the quiz')} <Icon name="arrow" />
        </Button>
      ) : state === 'open' ? (
        <Button className="mt" to={`/info/${checkpoint.id}`} data-autofocus>
          {checkpoint.attemptsUsed ? t('Retry quest') : t('Start quest')} <Icon name="arrow" />
        </Button>
      ) : (
        <Button className="mt" variant="ghost" onClick={onClose} data-autofocus>
          {state === 'done' ? t('Checkpoint cleared') : t('Not open yet')}
        </Button>
      )}
    </Sheet>
  );
}

export default function MapPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { student } = useSession();
  const [params, setParams] = useSearchParams();
  const [zone, setZone] = useState('campus');
  const [checkpoints, setCheckpoints] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.checkpoints(), api.activeAttempt()])
      .then(([list, current]) => {
        if (!alive) return;
        setCheckpoints(list.checkpoints);
        setActive(current.attempt);
      })
      .catch((error) => alive && toast.error(errorText(error)));
    return () => {
      alive = false;
    };
  }, [toast]);

  const selectedId = Number(params.get('cp')) || null;
  const selected = checkpoints.find((c) => c.id === selectedId) ?? null;
  const select = (id) => setParams(id ? { cp: String(id) } : {}, { replace: true });

  return (
    <div className="mapscreen">
      <div className={`mapscreen__map${zone === 'city' ? ' is-grey' : ''}`}>
        <MapView
          checkpoints={zone === 'campus' ? checkpoints : []}
          selectedId={selectedId}
          onSelect={select}
        />
      </div>

      {zone === 'city' && (
        <div className="mapscreen__soon anim-pop">
          <div className="card panel-accent row">
            <Icon name="lock" size={32} />
            <div>
              <Display as="div" size="h2">
                {t('Coming soon')}
              </Display>
              <p className="small muted">{t('City zones open after the campus quests.')}</p>
            </div>
          </div>
        </div>
      )}

      <header className="mapscreen__top">
        <div className="card card--tight row mapscreen__me">
          <Link to="/profile" className="mapscreen__avatar" aria-label={t('Open profile')}>
            <Avatar
              size={44}
              name={student.displayName}
              avatar={{ url: student.pictureUrl, preset: student.avatarPreset }}
              label={t('Your avatar')}
            />
          </Link>
          <div className="grow">
            <h1 className="display strong mapscreen__name">{student.displayName}</h1>
            <p className="mono h2 accent mapscreen__points">
              {formatNumber(student.totalPoints)} <span className="caption muted">{t('PTS')}</span>
            </p>
          </div>
          <Chip tone="sub">
            {t('Rank')} #{student.rank}
          </Chip>
        </div>
        {active && (
          <Link to={`/quiz/${active.id}`} className="card card--tight row mapscreen__resume">
            <Icon name="clock" />
            <span className="grow">
              <strong>{t('You have a quiz in progress.')}</strong> {active.checkpointName}
            </span>
            <Icon name="chevron" size={20} />
          </Link>
        )}
        <div className="tabs tabs--2" role="tablist" aria-label={t('Map zone')}>
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={zone === 'campus'}
            onClick={() => setZone('campus')}
          >
            {t('Campus')}
          </button>
          <button
            type="button"
            role="tab"
            className="tab tab--locked"
            aria-selected={zone === 'city'}
            onClick={() => setZone('city')}
          >
            <Icon name="lock" size={18} /> {t('City zones')}
          </button>
        </div>
      </header>

      {selected && zone === 'campus' && (
        <CheckpointSheet
          checkpoint={selected}
          active={active}
          onClose={() => {
            select(null);
            navigate('/map', { replace: true });
          }}
        />
      )}
    </div>
  );
}
