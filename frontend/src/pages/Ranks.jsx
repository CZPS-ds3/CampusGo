import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Button } from '../components/Button.jsx';
import { IconButton, Icon } from '../components/icons.jsx';
import { Page, Skeleton } from '../components/Screen.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { Chip, EmptyState } from '../components/ui.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { formatNumber, t } from '../i18n.js';

const PODIUM_ORDER = [1, 0, 2]; // silver, gold, bronze as displayed left to right
const PODIUM_TONE = ['accent', 'sub', 'ok'];

function Podium({ entries, nameOf }) {
  const top = entries.slice(0, 3);
  if (top.length === 0) return null;
  return (
    <ol className="podium" aria-label={t('Top three')}>
      {PODIUM_ORDER.filter((i) => top[i]).map((i) => (
        <li key={top[i].id} className={`podium__spot podium__spot--${i + 1}`}>
          <div className={`card podium__card podium__card--${PODIUM_TONE[i]}`}>
            <span className="display h2">{top[i].rank}</span>
            <span className="podium__name">{nameOf(top[i])}</span>
            <span className="mono small">{formatNumber(top[i].points)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Rows({ entries, mine, nameOf, detailOf }) {
  return (
    <ol className="board">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className={`board__row${mine(entry) ? ' is-you' : ''}`}
          aria-current={mine(entry) || undefined}
        >
          <span className="board__rank mono accent">{entry.rank}</span>
          <Avatar
            size={36}
            name={nameOf(entry)}
            avatar={{ url: entry.pictureUrl, preset: entry.avatarPreset }}
          />
          <span className="board__name">
            {nameOf(entry)}
            {mine(entry) && <span className="chip chip--accent">{t('you')}</span>}
            {detailOf && <span className="small muted">{detailOf(entry)}</span>}
          </span>
          <span className="mono">
            {formatNumber(entry.points)} <span className="sr-only">{t('points')}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function Ranks() {
  const { student } = useSession();
  const toast = useToast();
  const inTeam = Boolean(student?.teamId);
  const [tab, setTab] = useState('solo');
  const [solo, setSolo] = useState(null);
  const [team, setTeam] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (which) => {
    setLoading(true);
    try {
      if (which === 'solo') setSolo(await api.soloBoard());
      else setTeam(await api.teamBoard());
      setError('');
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'solo' || inTeam) load(tab);
  }, [tab, inTeam, load]);

  const data = tab === 'solo' ? solo : team;
  const standing = tab === 'solo' ? data?.you : data?.yourTeam;

  return (
    <Page
      title={t('Ranks')}
      wide
      aside={
        <IconButton
          icon="refresh"
          label={t('Refresh ranks')}
          disabled={loading}
          onClick={() => load(tab).then(() => toast.info(t('Ranks updated')))}
        />
      }
    >
      <div className="tabs tabs--2" role="tablist" aria-label={t('Ranking type')}>
        {['solo', 'team'].map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
          >
            {k === 'team' && !inTeam && <Icon name="lock" size={18} />} {t(k)}
          </button>
        ))}
      </div>

      {error && <p className="field-note field-note--error">{error}</p>}

      {tab === 'team' && !inTeam ? (
        <EmptyState
          icon="lock"
          title={t('Team ranks locked')}
          body={t('Join or create a team to see the team board.')}
          action={
            <Button small variant="sub" to="/team">
              {t('Go to team')}
            </Button>
          }
        />
      ) : !data && !error ? (
        <Skeleton rows={4} height={56} />
      ) : data ? (
        data.entries.length === 0 ? (
          <EmptyState
            icon="ranks"
            title={t('No players yet')}
            body={
              tab === 'team' ? t('No team has two members yet.') : t('Be the first on the board.')
            }
          />
        ) : (
          <>
            <Podium
              entries={data.entries}
              nameOf={(e) => (tab === 'solo' ? e.displayName : e.name)}
            />
            <Rows
              entries={data.entries.slice(3)}
              mine={(e) => (tab === 'solo' ? e.isYou : e.isYourTeam)}
              nameOf={(e) => (tab === 'solo' ? e.displayName : e.name)}
              detailOf={tab === 'team' ? (e) => t('{n} members', { n: e.members }) : undefined}
            />
            {standing &&
              !data.entries.slice(3).some((e) => (tab === 'solo' ? e.isYou : e.isYourTeam)) && (
                <div className="card ranks__you">
                  <span className="mono h2 accent">{standing.rank}</span>
                  <span className="grow strong truncate">
                    {tab === 'solo' ? student.displayName : t('Your team')} ({t('you')})
                  </span>
                  <span className="mono accent">{formatNumber(standing.points)}</span>
                </div>
              )}
          </>
        )
      ) : null}
      {tab === 'solo' && data && !inTeam && (
        <p className="small muted">
          <Chip tone="mute" icon="lock">
            {t('Team ranks locked')}
          </Chip>{' '}
          <Link to="/team" className="link">
            {t('Go to team')}
          </Link>
        </p>
      )}
    </Page>
  );
}
