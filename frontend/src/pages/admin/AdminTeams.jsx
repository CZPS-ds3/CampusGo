import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { errorText } from '../../api/errorText.js';
import { Button } from '../../components/Button.jsx';
import { Icon } from '../../components/icons.jsx';
import { Skeleton } from '../../components/Screen.jsx';
import { Modal } from '../../components/Sheet.jsx';
import { Display, EmptyState, Input } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { formatNumber, t } from '../../i18n.js';

function TeamCard({ team, onChanged }) {
  const toast = useToast();
  const [name, setName] = useState(team.name);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);

  const run = async (work, done) => {
    setError('');
    try {
      await work();
      if (done) toast.info(done);
      onChanged();
    } catch (failure) {
      setError(errorText(failure));
    }
  };

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
        <Button small type="submit" disabled={name.trim() === team.name || name.trim().length < 2}>
          {t('Rename')}
        </Button>
      </form>
      {error && (
        <p className="field-note field-note--error" role="alert">
          <Icon name="warn" size={18} />
          <span>{error}</span>
        </p>
      )}
      <ul className="admin-log">
        {team.members.map((m) => (
          <li key={m.id}>
            <span>{m.displayName}</span>
            <button
              type="button"
              className="linkbtn"
              onClick={() => run(() => api.admin.removeMember(team.id, m.id), t('Member removed'))}
            >
              {t('Remove')}
            </button>
          </li>
        ))}
      </ul>
      <Button small variant="dark" onClick={() => setConfirm(true)}>
        {t('Delete team')}
      </Button>
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
