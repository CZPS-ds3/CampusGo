import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { errorText } from '../../api/errorText.js';
import { Button } from '../../components/Button.jsx';
import { BarList, LineChart, StackBar } from '../../components/charts.jsx';
import { Icon } from '../../components/icons.jsx';
import { Skeleton } from '../../components/Screen.jsx';
import { Display, EmptyState } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { formatNumber, t } from '../../i18n.js';
import { formatDateTime, statusLabel } from './format.js';

const SERIES_COLORS = { logins: 'var(--sub)', passed: 'var(--signal)' };
const STATUS_COLORS = {
  active: 'var(--ok)',
  blocked: 'var(--signal)',
  archived: 'var(--line2)',
  deleted: 'var(--fg)',
};

const clock = (iso) =>
  new Intl.DateTimeFormat(document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  }).format(new Date(iso));

/** One sentence per activity type; an unknown type falls back to a neutral line so the feed never breaks. */
function activityText(item) {
  const who = item.studentName ?? t('A student');
  switch (item.type) {
    case 'login':
      return t('{name} signed in', { name: who });
    case 'logout':
      return t('{name} signed out', { name: who });
    case 'passed':
      return t('{name} passed {checkpoint}', { name: who, checkpoint: item.checkpointName });
    case 'status_blocked':
      return t('An admin blocked {name}', { name: who });
    case 'status_archived':
      return t('An admin archived {name}', { name: who });
    case 'status_active':
      return t('An admin restored {name}', { name: who });
    case 'account_deleted':
      return t('{name} deleted their account', { name: who });
    case 'forced_logout':
      return t('An admin signed {name} out', { name: who });
    default:
      return t('Other activity');
  }
}

function Card({ title, takeaway, span, children }) {
  return (
    <article className={`admin-card${span ? ` admin-card--${span}` : ''}`}>
      <h2 className="display h3">{title}</h2>
      {takeaway && <p className="small muted">{takeaway}</p>}
      {children}
    </article>
  );
}

/** Seeded quiz texts are placeholders; the dashboard says so until admins have replaced them all. */
function PlaceholderBanner({ placeholders }) {
  if (!placeholders || placeholders.quests.length === 0) return null;
  return (
    <section className="admin-card admin-card--warn" role="alert">
      <h2 className="display h3">{t('Placeholder content is still live')}</h2>
      <p className="small">
        {t('{questions} placeholder questions and {facts} placeholder facts in: {quests}.', {
          questions: placeholders.questions,
          facts: placeholders.facts,
          quests: placeholders.quests.join(', '),
        })}
      </p>
      <p className="small muted">{t('Replace them on the Quests page before the pilot.')}</p>
    </section>
  );
}

function Tile({ label, value, delta }) {
  return (
    <div className="card card--tight admin-tile">
      <p className="caption muted">{label}</p>
      <p className="mono h1 accent">{value === null ? '–' : formatNumber(value)}</p>
      {delta !== undefined && delta !== null && (
        <p className="small muted">
          {delta > 0 ? '+' : ''}
          {delta} {t('vs yesterday')}
        </p>
      )}
    </div>
  );
}

const Missing = ({ onRetry }) => (
  <div className="stack stack--tight">
    <p className="small muted">{t('Could not load.')}</p>
    <Button small variant="ghost" onClick={onRetry}>
      <Icon name="refresh" size={18} /> {t('Retry')}
    </Button>
  </div>
);

/** The admin start page: key numbers, two charts, per-checkpoint results, leaders, who is online, latest events. */
export default function AdminOverview() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api.admin
      .stats()
      .then(setStats)
      .catch((error) => {
        setFailed(true);
        toast.error(errorText(error));
      });
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (failed) return <Missing onRetry={load} />;
  if (!stats) return <Skeleton rows={3} height={120} />;

  const {
    tiles,
    daily,
    usersByStatus,
    checkpoints,
    topPlayers,
    topTeams,
    signedIn,
    recent,
    placeholders,
  } = stats;
  const retry = <Missing onRetry={load} />;
  const delta = (today, before) => (today === null || before === null ? null : today - before);
  const totalLogins = daily?.reduce((n, d) => n + d.logins, 0) ?? 0;
  const totalPassed = daily?.reduce((n, d) => n + d.passed, 0) ?? 0;

  return (
    <div className="admin-dash">
      <PlaceholderBanner placeholders={placeholders} />
      <section className="admin-tiles" aria-label={t('Key numbers')}>
        <Tile label={t('Signed in now')} value={tiles.signedInNow} />
        <Tile label={t('Active players')} value={tiles.activeStudents} />
        <Tile
          label={t('Logins today')}
          value={tiles.loginsToday}
          delta={delta(tiles.loginsToday, tiles.loginsYesterday)}
        />
        <Tile
          label={t('Quests passed today')}
          value={tiles.questsPassedToday}
          delta={delta(tiles.questsPassedToday, tiles.questsPassedYesterday)}
        />
      </section>

      <Card
        span="8"
        title={t('Logins and quests per day')}
        takeaway={t('{logins} logins and {passed} quests passed in the last 14 days.', {
          logins: totalLogins,
          passed: totalPassed,
        })}
      >
        {!daily ? (
          retry
        ) : totalLogins + totalPassed === 0 ? (
          <p className="muted small">
            {t('No activity yet. Numbers appear after the first login.')}
          </p>
        ) : (
          <LineChart
            labels={daily.map((d) => d.date)}
            summary={t('Line chart: {logins} logins and {passed} quests passed in 14 days.', {
              logins: totalLogins,
              passed: totalPassed,
            })}
            series={[
              {
                key: 'logins',
                label: t('Logins'),
                color: SERIES_COLORS.logins,
                dash: '6 4',
                values: daily.map((d) => d.logins),
              },
              {
                key: 'passed',
                label: t('Quests passed'),
                color: SERIES_COLORS.passed,
                values: daily.map((d) => d.passed),
              },
            ]}
          />
        )}
      </Card>

      <Card span="4" title={t('Players by status')}>
        {!usersByStatus ? (
          retry
        ) : (
          <StackBar
            summary={t('Players by status: {n} active.', { n: usersByStatus.active })}
            segments={Object.keys(STATUS_COLORS).map((key) => ({
              key,
              label: statusLabel(key),
              value: usersByStatus[key],
              color: STATUS_COLORS[key],
            }))}
          />
        )}
      </Card>

      <Card span="7" title={t('Checkpoint results')} takeaway={t('Share of attempts that passed.')}>
        {!checkpoints ? (
          retry
        ) : (
          <BarList
            rows={checkpoints.map((c) => ({
              key: c.id,
              label: c.name,
              chip: c.isActive ? null : t('Not open yet'),
              muted: !c.isActive,
              value: c.passRate,
              text:
                c.passRate === null
                  ? t('No attempts')
                  : `${Math.round(c.passRate * 100)}% · ${c.attempts}`,
            }))}
          />
        )}
      </Card>

      <div className="admin-card--5 admin-stack">
        <Card title={t('Top players')}>
          {!topPlayers ? (
            retry
          ) : topPlayers.length === 0 ? (
            <p className="muted small">{t('Nobody has scored yet.')}</p>
          ) : (
            <ol className="admin-log admin-log--numbered">
              {topPlayers.map((p) => (
                <li key={p.rank}>
                  <span>
                    <span className="mono accent">{p.rank}</span> {p.displayName}
                  </span>
                  <span className="mono">{formatNumber(p.points)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card title={t('Top teams')}>
          {!topTeams ? (
            retry
          ) : topTeams.length === 0 ? (
            <p className="muted small">{t('No team has two members yet.')}</p>
          ) : (
            <ol className="admin-log admin-log--numbered">
              {topTeams.map((team) => (
                <li key={team.rank}>
                  <span>
                    <span className="mono accent">{team.rank}</span> {team.name}{' '}
                    <span className="small muted">({team.members})</span>
                  </span>
                  <span className="mono">{formatNumber(team.points)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card span="4" title={t('Signed in now')}>
        {!signedIn ? (
          retry
        ) : signedIn.length === 0 ? (
          <p className="muted small">{t('Nobody is signed in.')}</p>
        ) : (
          <ul className="admin-log">
            {signedIn.map((s, i) => (
              <li key={i}>
                <span>{s.displayName}</span>
                <span className="small muted">{t('since {time}', { time: clock(s.since) })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card span="8" title={t('Recent activity')}>
        {!recent ? (
          retry
        ) : recent.length === 0 ? (
          <EmptyState
            icon="clock"
            title={t('Nothing logged yet.')}
            body={t('Events appear here.')}
          />
        ) : (
          <ul className="admin-log">
            {recent.map((item, i) => (
              <li key={i}>
                <span>{activityText(item)}</span>
                <span className="small muted">{formatDateTime(item.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Display as="p" size="h3" className="sr-only">
        {t('End of the dashboard')}
      </Display>
    </div>
  );
}
