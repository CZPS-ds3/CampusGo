import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { errorText } from '../../api/errorText.js';
import { Button } from '../../components/Button.jsx';
import { Icon } from '../../components/icons.jsx';
import { Skeleton } from '../../components/Screen.jsx';
import { Modal } from '../../components/Sheet.jsx';
import { Chip, Display, EmptyState, Input } from '../../components/ui.jsx';
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js';
import { useToast } from '../../hooks/useToast.jsx';
import { formatNumber, t } from '../../i18n.js';

/**
 * Pop-up to add a student to a team (BR46): search by e-mail or name, or scroll the list of students
 * who are not in a team. Used when an invitation has expired.
 */
function AddMemberModal({ team, onClose, onAdded }) {
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const ticket = (latest.current += 1);
    const timer = setTimeout(() => {
      api.admin
        .users({ q: query.trim(), noTeam: '1' })
        .then(({ users }) => ticket === latest.current && setStudents(users))
        .catch((failure) => ticket === latest.current && setError(errorText(failure)));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      await api.admin.addTeamMember(team.id, chosen.id);
      onAdded(chosen);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('Add a student to {team}', { team: team.name })} onClose={onClose}>
      <Display as="h2" size="h2">
        {t('Add a student to {team}', { team: team.name })}
      </Display>
      <p className="muted mt-s">
        {t(
          'Only active students without a team are listed. Type part of an e-mail address or a name.',
        )}
      </p>
      <div className="mt">
        <Input
          label={t('Search by e-mail or name')}
          type="search"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          value={query}
          data-autofocus
          onChange={(event) => {
            setQuery(event.target.value);
            setChosen(null);
          }}
        />
      </div>
      <ul className="picker mt-s" aria-label={t('Students without a team')}>
        {students === null && <li className="small muted">{t('Loading…')}</li>}
        {students?.length === 0 && (
          <li className="small muted">{t('No student without a team matches.')}</li>
        )}
        {students?.map((student) => (
          <li key={student.id}>
            <button
              type="button"
              className={`picker__row${chosen?.id === student.id ? ' is-chosen' : ''}`}
              aria-pressed={chosen?.id === student.id}
              onClick={() => setChosen(student)}
            >
              <span className="strong truncate">{student.displayName}</span>
              <span className="small muted break">{student.email}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="field-note field-note--error mt-s" role="alert">
          <Icon name="warn" size={18} />
          <span>{error}</span>
        </p>
      )}
      <div className="grid2 mt">
        <Button small variant="ghost" onClick={onClose}>
          {t('Cancel')}
        </Button>
        <Button small busy={busy} disabled={!chosen} onClick={add}>
          {chosen ? t('Add {name}', { name: chosen.displayName }) : t('Add to team')}
        </Button>
      </div>
    </Modal>
  );
}

/** BR54: the order with one member moved one place up (-1) or down (+1). */
export function moveMember(ids, index, step) {
  const target = index + step;
  if (target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function TeamCard({ team, onChanged }) {
  const toast = useToast();
  const [name, setName] = useState(team.name);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState('');

  // A rename from another tab or an auto-refresh shows up, unless the admin is typing a new name right now.
  const [shownName, setShownName] = useState(team.name);
  useEffect(() => {
    if (team.name !== shownName) {
      setShownName(team.name);
      setName((typed) => (typed === shownName ? team.name : typed));
    }
  }, [team.name, shownName]);

  const run = async (work, done, key = '') => {
    setError('');
    setBusy(key);
    try {
      await work();
      if (done) toast.info(done);
      onChanged();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy('');
    }
  };

  const ids = team.members.map((m) => m.id);
  const move = (index, step) =>
    run(
      () => api.admin.reorderTeam(team.id, moveMember(ids, index, step)),
      t('Order saved'),
      `move-${ids[index]}`,
    );

  return (
    <li className="card stack">
      <div className="row row--between">
        <Display as="h3" size="h3" className="truncate">
          {team.name}
        </Display>
        <span className="mono small">
          {team.size}/5 · {formatNumber(team.score)}
        </span>
      </div>
      <form
        className="admin-inline"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          run(() => api.admin.renameTeam(team.id, name.trim()), t('Saved'));
        }}
      >
        <Input
          label={t('Team name')}
          maxLength={30}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button small type="submit" disabled={name.trim() === team.name || name.trim().length < 3}>
          {t('Rename')}
        </Button>
      </form>
      {error && (
        <p className="field-note field-note--error" role="alert">
          <Icon name="warn" size={18} />
          <span>{error}</span>
        </p>
      )}
      <p className="small muted">
        {t('Team order: when the leader leaves, the next member in this order becomes the leader.')}
      </p>
      <ol
        className="team-order"
        aria-label={t('Members of {team} in team order', { team: team.name })}
      >
        {team.members.map((m, index) => (
          <li key={m.id} className="team-order__row">
            <span className="mono small team-order__place">{index + 1}</span>
            <span className="grow truncate">
              {m.displayName}
              {m.status && m.status !== 'active' && (
                <span className="small muted"> · {t(m.status)}</span>
              )}
            </span>
            {m.id === team.leaderId ? (
              <Chip tone="accent" icon="bolt">
                {t('Leader')}
              </Chip>
            ) : (
              <button
                type="button"
                className="linkbtn"
                disabled={busy !== '' || (m.status && m.status !== 'active')}
                aria-label={t('Make leader: {name}', { name: m.displayName })}
                onClick={() =>
                  run(
                    () => api.admin.setTeamLeader(team.id, m.id),
                    t('{name} now leads the team', { name: m.displayName }),
                    `lead-${m.id}`,
                  )
                }
              >
                {t('Make leader')}
              </button>
            )}
            <span className="team-order__moves">
              <button
                type="button"
                className="icon-btn"
                disabled={index === 0 || busy !== ''}
                aria-label={t('Move {name} up', { name: m.displayName })}
                onClick={() => move(index, -1)}
              >
                <Icon name="chevron" size={16} className="rot-up" />
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled={index === team.members.length - 1 || busy !== ''}
                aria-label={t('Move {name} down', { name: m.displayName })}
                onClick={() => move(index, 1)}
              >
                <Icon name="chevron" size={16} className="rot-down" />
              </button>
            </span>
            <button
              type="button"
              className="linkbtn"
              disabled={busy !== ''}
              aria-label={t('Remove {name} from the team', { name: m.displayName })}
              onClick={() =>
                run(
                  () => api.admin.removeMember(team.id, m.id),
                  t('Member removed'),
                  `remove-${m.id}`,
                )
              }
            >
              {t('Remove')}
            </button>
          </li>
        ))}
      </ol>
      <div className="grid2">
        <Button small variant="sub" disabled={team.size >= 5} onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> {t('Add a student')}
        </Button>
        <Button small variant="dark" onClick={() => setConfirm(true)}>
          {t('Delete team')}
        </Button>
      </div>
      {team.size >= 5 && <p className="small muted">{t('This team is full (5 of 5).')}</p>}
      {adding && (
        <AddMemberModal
          team={team}
          onClose={() => setAdding(false)}
          onAdded={(student) => {
            setAdding(false);
            toast.info(
              t('{name} was added to {team}', { name: student.displayName, team: team.name }),
            );
            onChanged();
          }}
        />
      )}
      {confirm && (
        <Modal title={t('Confirm delete')} onClose={() => setConfirm(false)}>
          <Display as="h2" size="h2">
            {t('Delete this team?')}
          </Display>
          <p className="muted mt-s">{t('Members stay in the game but lose their team.')}</p>
          <div className="grid2 mt">
            <Button small variant="ghost" onClick={() => setConfirm(false)} data-autofocus>
              {t('Cancel')}
            </Button>
            <Button
              small
              onClick={() => {
                setConfirm(false);
                run(() => api.admin.deleteTeam(team.id), t('Team deleted'));
              }}
            >
              {t('Delete team')}
            </Button>
          </div>
        </Modal>
      )}
    </li>
  );
}

export default function AdminTeams() {
  const toast = useToast();
  const [teams, setTeams] = useState(null);

  const load = useCallback(() => {
    api.admin
      .teams()
      .then((result) => setTeams(result.teams))
      .catch((error) => toast.error(errorText(error)));
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const quietReload = useCallback(() => {
    api.admin
      .teams()
      .then((result) => setTeams(result.teams))
      .catch(() => {});
  }, []);
  useAutoRefresh(quietReload);

  if (!teams) return <Skeleton rows={3} height={120} />;
  return (
    <section className="stack" aria-labelledby="teams-title">
      <Display as="h2" size="h2" id="teams-title">
        {t('Teams')}
      </Display>
      {teams.length === 0 && (
        <EmptyState icon="team" title={t('No teams yet')} body={t('Teams appear here.')} />
      )}
      <ul className="admin-list">
        {teams.map((team) => (
          <TeamCard key={team.id} team={team} onChanged={load} />
        ))}
      </ul>
    </section>
  );
}
