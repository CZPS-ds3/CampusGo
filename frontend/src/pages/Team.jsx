import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Avatar } from '../components/Avatar.jsx';
import { Button } from '../components/Button.jsx';
import { Screen, Skeleton } from '../components/Screen.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { copy } from '../i18n.js';

const MAX_MEMBERS = 5;
const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

function Invitations({ items, onAnswer, busyId }) {
  return (
    <section className="panel stack" aria-labelledby="invites-title">
      <h2 id="invites-title">{copy.team.invitesTitle}</h2>
      {items.length === 0 && <p className="muted">{copy.team.noInvites}</p>}
      <ul className="stack">
        {items.map((invite) => (
          <li key={invite.id} className="invite stack stack--tight">
            <p>
              <strong>{invite.teamName}</strong>
              <br />
              <span className="muted">{copy.team.from(invite.teamName, invite.inviterName)}</span>
            </p>
            <p className="field__hint">
              {copy.team.expires(dateFormat.format(new Date(invite.expiresAt)))}
            </p>
            <div className="row">
              <Button
                small
                busy={busyId === invite.id}
                onClick={() => onAnswer(invite.id, 'accept')}
              >
                {copy.team.accept}
              </Button>
              <Button
                small
                variant="quiet"
                disabled={busyId === invite.id}
                onClick={() => onAnswer(invite.id, 'reject')}
              >
                {copy.team.reject}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Team() {
  const toast = useToast();
  const { refresh } = useSession();
  const [team, setTeam] = useState(undefined);
  const [invites, setInvites] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState('');
  const [fieldError, setFieldError] = useState('');

  const load = useCallback(async () => {
    try {
      const [mine, pending] = await Promise.all([api.myTeam(), api.invitations()]);
      setTeam(mine.team);
      setInvites(pending.invitations);
    } catch (error) {
      toast.error(errorText(error));
      setTeam(null);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const guarded = async (key, work) => {
    setBusy(key);
    setFieldError('');
    try {
      await work();
    } catch (error) {
      setFieldError(errorText(error));
    } finally {
      setBusy('');
    }
  };

  const create = (event) => {
    event.preventDefault();
    return guarded('create', async () => {
      const { team: created } = await api.createTeam(name.trim());
      setTeam(created);
      setInvites([]);
      await refresh();
    });
  };

  const sendInvite = (event) => {
    event.preventDefault();
    return guarded('invite', async () => {
      await api.invite(email.trim());
      setEmail('');
      toast.info(copy.team.invited);
    });
  };

  const answer = (id, decision) =>
    guarded(`invite-${id}`, async () => {
      if (decision === 'accept') {
        const { team: joined } = await api.acceptInvitation(id);
        setTeam(joined);
        setInvites([]);
        await refresh();
      } else {
        await api.rejectInvitation(id);
        setInvites((list) => list.filter((i) => i.id !== id));
      }
    }).then(() => load());

  if (team === undefined) {
    return (
      <Screen title={copy.team.title} wide>
        <Skeleton rows={3} />
      </Screen>
    );
  }

  return (
    <Screen title={copy.team.title} wide>
      {fieldError && (
        <p className="field__error" role="alert">
          {fieldError}
        </p>
      )}
      {team ? (
        <div className="twocol">
          <section className="panel stack" aria-labelledby="team-name">
            <div className="row">
              <h2 id="team-name">{team.name}</h2>
              <span className="chip chip--grey">
                {copy.team.score}: {team.score.toLocaleString('en')}
              </span>
            </div>
            {!team.active && <p className="muted">{copy.team.inactive}</p>}
            <h3>
              {copy.team.members} ({team.size}/{MAX_MEMBERS})
            </h3>
            <ul className="members">
              {team.members.map((m) => (
                <li key={m.id} className="member">
                  <Avatar name={m.displayName} url={m.pictureUrl} />
                  <span className="member__name">{m.displayName}</span>
                  <span className="mono">{m.totalPoints.toLocaleString('en')}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel stack" aria-labelledby="invite-title">
            <h2 id="invite-title">{copy.team.inviteTitle}</h2>
            {team.size >= MAX_MEMBERS ? (
              <p className="muted">{copy.team.full}</p>
            ) : (
              <form className="stack" onSubmit={sendInvite} noValidate>
                <div className="field">
                  <label className="field__label" htmlFor="invite-email">
                    {copy.team.inviteLabel}
                  </label>
                  <input
                    id="invite-email"
                    className="input"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <Button type="submit" busy={busy === 'invite'} disabled={!email.trim()}>
                  {copy.team.invite}
                </Button>
              </form>
            )}
          </section>
        </div>
      ) : (
        <div className="twocol">
          <section className="panel stack" aria-labelledby="create-title">
            <h2 id="create-title">{copy.team.noTeamTitle}</h2>
            <p>{copy.team.noTeamBody}</p>
            <form className="stack" onSubmit={create}>
              <div className="field">
                <label className="field__label" htmlFor="team-name-input">
                  {copy.team.nameLabel}
                </label>
                <input
                  id="team-name-input"
                  className="input"
                  maxLength={30}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <Button type="submit" busy={busy === 'create'} disabled={name.trim().length < 2}>
                {copy.team.create}
              </Button>
            </form>
          </section>
          <Invitations
            items={invites}
            onAnswer={answer}
            busyId={busy.startsWith('invite-') ? Number(busy.slice(7)) : null}
          />
        </div>
      )}
    </Screen>
  );
}
