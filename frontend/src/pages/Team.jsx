import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Avatar } from '../components/Avatar.jsx';
import { Button } from '../components/Button.jsx';
import { Icon } from '../components/icons.jsx';
import { Page, Skeleton } from '../components/Screen.jsx';
import { Chip, Display, EmptyState, Input } from '../components/ui.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { formatNumber, t } from '../i18n.js';

const MAX_MEMBERS = 5;
const dateFormat = (lang) =>
  new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const hms = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
};

function Invitations({ items, onAnswer, busyId }) {
  return (
    <section className="stack" aria-labelledby="invites-title">
      <Display as="h2" size="h2" id="invites-title">
        {t('Invitations')}
      </Display>
      {items.length === 0 && (
        <EmptyState
          icon="mail"
          title={t('No invites')}
          body={t('When a team invites you, it shows up here.')}
        />
      )}
      <ul className="stack">
        {items.map((invite) => (
          <li key={invite.id} className="card stack stack--tight">
            <div className="row row--between row--top">
              <div>
                <p className="display h3">{invite.teamName}</p>
                <p className="small muted">
                  {t('From')} {invite.inviterName}
                </p>
              </div>
              <Chip tone="sub">{t('Open')}</Chip>
            </div>
            <p className="small muted">
              {t('Valid until {when}', {
                when: dateFormat(document.documentElement.lang).format(new Date(invite.expiresAt)),
              })}
            </p>
            <div className="grid2">
              <Button
                small
                variant="ok"
                busy={busyId === invite.id}
                onClick={() => onAnswer(invite.id, 'accept')}
              >
                {t('Accept')}
              </Button>
              <Button
                small
                variant="ghost"
                disabled={busyId === invite.id}
                onClick={() => onAnswer(invite.id, 'reject')}
              >
                {t('Reject')}
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
  const [picture, setPicture] = useState(null);
  const [busy, setBusy] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [notice, setNotice] = useState('');
  const [, tick] = useState(0);
  const fileInput = useRef(null);

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

  // Invitations from other teams show up without a reload: check again every 30 s and when the tab returns.
  useEffect(() => {
    const again = () => !document.hidden && load();
    const id = setInterval(again, 30000);
    document.addEventListener('visibilitychange', again);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', again);
    };
  }, [load]);

  // The countdown of pending invitations ticks every second.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

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
    if (name.trim().length < 2) {
      setFieldError(t('Team name is required'));
      return undefined;
    }
    return guarded('create', async () => {
      const { team: created } = await api.createTeam(name.trim());
      if (picture) {
        try {
          await api.uploadTeamPicture(picture);
        } catch {
          // The picture is optional; the team exists either way.
        }
      }
      setInvites([]);
      toast.info(t('Team {name} created', { name: created.name }));
      await refresh();
      await load();
    });
  };

  const sendInvite = (event) => {
    event.preventDefault();
    return guarded('invite', async () => {
      const before = team.pending.length;
      await api.invite(email.trim());
      setEmail('');
      const { team: after } = await api.myTeam();
      setTeam(after);
      // The slot below is the proof: it only appears when an invitation was really created.
      setNotice(
        after.pending.length > before
          ? t('Invitation sent. It is shown as a pending slot until it is answered.')
          : t('If the user exists and can be invited, an invitation has been sent.'),
      );
      toast.info(t('If the user exists and can be invited, an invitation has been sent.'));
    });
  };

  const answer = (id, decision) =>
    guarded(`invite-${id}`, async () => {
      if (decision === 'accept') {
        const { team: joined } = await api.acceptInvitation(id);
        toast.info(t('Joined {name}', { name: joined.name }));
        await refresh();
      } else {
        await api.rejectInvitation(id);
      }
    }).then(() => load());

  if (team === undefined) {
    return (
      <Page title={t('Team')}>
        <Skeleton rows={3} />
      </Page>
    );
  }

  const error = fieldError && (
    <p className="field-note field-note--error" role="alert">
      <Icon name="warn" size={18} />
      <span>{fieldError}</span>
    </p>
  );

  if (!team) {
    return (
      <Page title={t('Team')} wide>
        <p className="muted">{t('Teams of 2 to 5 share a rank on the team board.')}</p>
        {error}
        <div className="twocol">
          <form className="card stack" noValidate onSubmit={create}>
            <Display as="h2" size="h3">
              {t('Create team')}
            </Display>
            <div className="row">
              {picture ? (
                <Avatar
                  size={56}
                  avatar={{ url: URL.createObjectURL(picture) }}
                  label={t('Team picture')}
                />
              ) : (
                <span className="empty__icon">
                  <Icon name="team" />
                </span>
              )}
              <button
                type="button"
                className="dashed-btn grow"
                onClick={() => fileInput.current?.click()}
              >
                <Icon name="upload" size={20} />
                <span className="caption">{t('Picture (optional)')}</span>
              </button>
              <input
                ref={fileInput}
                type="file"
                className="sr-only"
                accept="image/png,image/jpeg,image/webp"
                tabIndex={-1}
                aria-label={t('Upload team picture')}
                onChange={(event) => setPicture(event.target.files?.[0] ?? null)}
              />
            </div>
            <Input
              label={t('Team name *')}
              maxLength={30}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" variant="ok" busy={busy === 'create'}>
              {t('Create team')}
            </Button>
          </form>
          <Invitations
            items={invites}
            onAnswer={answer}
            busyId={busy.startsWith('invite-') ? Number(busy.slice(7)) : null}
          />
        </div>
      </Page>
    );
  }

  const slots = Array.from({ length: MAX_MEMBERS }, (_, k) => {
    if (k < team.members.length) return { kind: 'member', member: team.members[k] };
    const pending = team.pending[k - team.members.length];
    return pending ? { kind: 'pending', pending } : { kind: 'open' };
  });
  const full = team.members.length + team.pending.length >= MAX_MEMBERS;

  return (
    <Page title={team.name} wide>
      <p className="mono accent">
        {team.members.length}/{MAX_MEMBERS} <span className="caption muted">{t('members')}</span>
        {' · '}
        {formatNumber(team.score)} <span className="caption muted">{t('Team score')}</span>
      </p>
      {!team.active && (
        <p className="small muted">{t('A team appears in the ranking from two members.')}</p>
      )}
      {error}
      <div className="twocol">
        <ul className="stack stack--tight" aria-label={t('Members')}>
          {slots.map((slot, k) =>
            slot.kind === 'member' ? (
              <li key={k} className="card card--tight row">
                <Avatar
                  size={40}
                  name={slot.member.displayName}
                  avatar={{ url: slot.member.pictureUrl, preset: slot.member.avatarPreset }}
                />
                <span className="grow truncate strong">{slot.member.displayName}</span>
                <span className="mono small">{formatNumber(slot.member.totalPoints)}</span>
              </li>
            ) : (
              <li key={k} className="slot row">
                <span className="slot__icon">
                  <Icon name={slot.kind === 'pending' ? 'clock' : 'plus'} size={18} />
                </span>
                <span className="small">
                  {slot.kind === 'pending' ? (
                    <>
                      {t('Invite pending')} ·{' '}
                      <span className="mono">
                        {hms(Date.parse(slot.pending.expiresAt) - Date.now())}
                      </span>{' '}
                      {t('left')}
                    </>
                  ) : (
                    t('Open slot')
                  )}
                </span>
              </li>
            ),
          )}
        </ul>
        <section className="stack" aria-labelledby="invite-title">
          <Display as="h2" size="h2" id="invite-title">
            {t('Invite by email')}
          </Display>
          {full ? (
            <p className="muted">{t('Your team is full (5 of 5)')}</p>
          ) : (
            <form className="stack" noValidate onSubmit={sendInvite}>
              <Input
                label={t('School email')}
                type="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="name@heilbronn.dhbw.de"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                hint={t('Invitations expire after 24 hours.')}
              />
              <Button type="submit" variant="sub" busy={busy === 'invite'} disabled={!email.trim()}>
                <Icon name="mail" /> {t('Send invite')}
              </Button>
            </form>
          )}
          {notice && (
            <p className="field-note" role="status">
              <Icon name="check" size={18} />
              <span>{notice}</span>
            </p>
          )}
        </section>
      </div>
    </Page>
  );
}
