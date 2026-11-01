import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { errorText } from '../../api/errorText.js';
import { Button } from '../../components/Button.jsx';
import { Icon } from '../../components/icons.jsx';
import { Skeleton } from '../../components/Screen.jsx';
import { Modal } from '../../components/Sheet.jsx';
import { Chip, Display, Input } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { formatNumber, t } from '../../i18n.js';
import { STATUS_TONE, attemptLabel, eventLabel, formatDateTime, statusLabel } from './format.js';

function EditForm({ user, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    nickname: user.nickname ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.admin.updateUser(user.id, form);
      toast.info(t('Saved'));
      onSaved();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack" noValidate onSubmit={save}>
      <Display as="h2" size="h3">
        {t('Edit information')}
      </Display>
      <div className="grid2">
        <Input label={t('First name')} value={form.firstName} onChange={set('firstName')} />
        <Input label={t('Last name')} value={form.lastName} onChange={set('lastName')} />
      </div>
      <Input
        label={t('School email')}
        type="email"
        autoCapitalize="none"
        spellCheck={false}
        value={form.email}
        onChange={set('email')}
      />
      <Input
        label={t('Nickname (optional)')}
        maxLength={20}
        value={form.nickname}
        onChange={set('nickname')}
      />
      {error && (
        <p className="field-note field-note--error" role="alert">
          <Icon name="warn" size={18} />
          <span>{error}</span>
        </p>
      )}
      <Button type="submit" busy={busy}>
        {t('Save')}
      </Button>
    </form>
  );
}

export default function AdminUser() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [reason, setReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    api.admin
      .user(id)
      .then(setData)
      .catch((error) => {
        toast.error(errorText(error));
        navigate('/admin/users', { replace: true });
      });
  }, [id, navigate, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key, work, done) => {
    setBusy(key);
    try {
      await work();
      if (done) toast.info(done);
      load();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy('');
    }
  };

  if (!data) return <Skeleton rows={3} height={96} />;
  const { user, sessions, attempts, events } = data;
  const isAdmin = user.role === 'admin';
  const deleted = user.status === 'deleted';
  const erased = deleted && user.erased;

  return (
    <section className="stack" aria-labelledby="user-title">
      <Link to="/admin/users" className="link">
        <Icon name="back" size={18} /> {t('All users')}
      </Link>
      <div className="card stack stack--tight">
        <div className="row row--between row--top">
          <Display as="h2" size="h2" id="user-title">
            {user.firstName} {user.lastName}
          </Display>
          <span className="admin-user__chips">
            <Chip tone={STATUS_TONE[user.status]}>{statusLabel(user.status)}</Chip>
            {user.reported && <Chip tone="warn">{t('Reported')}</Chip>}
            {isAdmin && <Chip tone="sub">{t('Admin')}</Chip>}
          </span>
        </div>
        <p className="small muted break">{user.email}</p>
        <p className="small">
          <span className="mono">{formatNumber(user.totalPoints)}</span> {t('PTS')} ·{' '}
          {user.questsPassed}/8 {t('quests')} · {user.teamName ?? t('No team yet')}
        </p>
        {user.statusReason && (
          <p className="small muted">
            {t('Reason')}: {user.statusReason}
          </p>
        )}
        {user.reported && (
          <p className="small muted">
            {t('Report')}: {user.reportReason}
          </p>
        )}
      </div>

      {deleted && (
        <div className="card stack" data-testid="deleted-panel">
          <Display as="h2" size="h3">
            {erased ? t('Erased account') : t('Deleted account')}
          </Display>
          <p className="small">
            {erased
              ? t('This account was erased for good on {when}. Nothing can be restored.', {
                  when: formatDateTime(user.deletedAt),
                })
              : t('This account was deleted on {when}. You can restore it, or erase it for good.', {
                  when: formatDateTime(user.deletedAt),
                })}
          </p>
          {!erased && (
            <div className="admin-actions">
              <Button
                small
                variant="ok"
                busy={busy === 'restore'}
                onClick={() =>
                  act('restore', () => api.admin.restoreUser(user.id), t('Account restored'))
                }
              >
                {t('Restore account')}
              </Button>
              <Button small variant="dark" onClick={() => setConfirmErase(true)}>
                <Icon name="close" size={18} /> {t('Delete permanently')}
              </Button>
            </div>
          )}
        </div>
      )}

      {!isAdmin && !deleted && (
        <div className="card stack">
          <Display as="h2" size="h3">
            {t('Account actions')}
          </Display>
          <Input
            label={t('Reason (optional)')}
            maxLength={200}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="admin-actions">
            {user.status === 'blocked' ? (
              <Button
                small
                variant="ok"
                busy={busy === 'unblock'}
                onClick={() =>
                  act('unblock', () => api.admin.setStatus(user.id, 'active'), t('Unblocked'))
                }
              >
                {t('Unblock')}
              </Button>
            ) : (
              <Button
                small
                busy={busy === 'block'}
                onClick={() =>
                  act(
                    'block',
                    () => api.admin.setStatus(user.id, 'blocked', reason || undefined),
                    t('Blocked'),
                  )
                }
              >
                {t('Block from playing')}
              </Button>
            )}
            {user.status === 'archived' ? (
              <Button
                small
                variant="sub"
                busy={busy === 'unarchive'}
                onClick={() =>
                  act('unarchive', () => api.admin.setStatus(user.id, 'active'), t('Restored'))
                }
              >
                {t('Restore')}
              </Button>
            ) : (
              <Button
                small
                variant="sub"
                busy={busy === 'archive'}
                onClick={() =>
                  act(
                    'archive',
                    () => api.admin.setStatus(user.id, 'archived', reason || undefined),
                    t('Archived'),
                  )
                }
              >
                {t('Archive')}
              </Button>
            )}
            {user.reported ? (
              <Button
                small
                variant="ghost"
                busy={busy === 'clear'}
                onClick={() =>
                  act('clear', () => api.admin.clearReport(user.id), t('Report cleared'))
                }
              >
                {t('Clear report')}
              </Button>
            ) : (
              <Button
                small
                variant="ghost"
                busy={busy === 'report'}
                disabled={!reason.trim()}
                onClick={() =>
                  act('report', () => api.admin.report(user.id, reason.trim()), t('Reported'))
                }
              >
                {t('Report')}
              </Button>
            )}
            <Button
              small
              variant="ghost"
              busy={busy === 'logout'}
              onClick={() =>
                act('logout', () => api.admin.forceLogout(user.id), t('Signed out everywhere'))
              }
            >
              {t('Sign out everywhere')}
            </Button>
            <Button small variant="dark" onClick={() => setConfirmDelete(true)}>
              <Icon name="close" size={18} /> {t('Delete account')}
            </Button>
          </div>
          <p className="small muted">
            {t('Report needs a reason. Blocked and archived accounts cannot sign in.')}
          </p>
        </div>
      )}

      {!isAdmin && !deleted && (
        <EditForm key={user.email + user.firstName} user={user} onSaved={load} />
      )}

      <div className="twocol">
        <section className="card stack" aria-labelledby="sessions-h">
          <Display as="h2" size="h3" id="sessions-h">
            {t('Sessions')}
          </Display>
          {sessions.length === 0 && <p className="muted small">{t('No sessions yet.')}</p>}
          <ul className="admin-log">
            {sessions.map((s) => (
              <li key={s.id}>
                <span>{formatDateTime(s.startedAt)}</span>
                <Chip tone={s.active ? 'ok' : 'mute'}>{s.active ? t('Active') : t('Ended')}</Chip>
              </li>
            ))}
          </ul>
        </section>
        <section className="card stack" aria-labelledby="quests-h">
          <Display as="h2" size="h3" id="quests-h">
            {t('Quests')}
          </Display>
          {attempts.length === 0 && <p className="muted small">{t('No quests yet.')}</p>}
          <ul className="admin-log">
            {attempts.map((a) => (
              <li key={a.id}>
                <span>
                  {a.checkpoint} · #{a.attemptNumber}
                  <span className="muted small"> · {formatDateTime(a.startedAt)}</span>
                </span>
                <Chip tone={a.status === 'passed' ? 'ok' : a.status === 'failed' ? 'red' : 'sub'}>
                  {attemptLabel(a.status)} · {formatNumber(a.points)}
                </Chip>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card stack" aria-labelledby="log-h">
        <Display as="h2" size="h3" id="log-h">
          {t('Activity log')}
        </Display>
        {events.length === 0 && <p className="muted small">{t('Nothing logged yet.')}</p>}
        <ul className="admin-log">
          {events.map((e, i) => (
            <li key={i}>
              <span>
                {eventLabel(e.type)}
                {e.detail ? <span className="muted small"> · {e.detail}</span> : null}
              </span>
              <span className="small muted">{formatDateTime(e.at)}</span>
            </li>
          ))}
        </ul>
      </section>

      {confirmDelete && (
        <Modal title={t('Confirm delete')} onClose={() => setConfirmDelete(false)}>
          <Display as="h2" size="h2">
            {t('Delete this account?')}
          </Display>
          <p className="muted mt-s">
            {t(
              'The account is marked as deleted, the person is signed out and leaves their team. You can restore it later, or erase it for good.',
            )}
          </p>
          <div className="grid2 mt">
            <Button small variant="ghost" onClick={() => setConfirmDelete(false)} data-autofocus>
              {t('Cancel')}
            </Button>
            <Button
              small
              onClick={() => {
                setConfirmDelete(false);
                act('delete', () => api.admin.deleteUser(user.id), t('Account deleted'));
              }}
            >
              {t('Delete account')}
            </Button>
          </div>
        </Modal>
      )}

      {confirmErase && (
        <Modal title={t('Confirm permanent delete')} onClose={() => setConfirmErase(false)}>
          <Display as="h2" size="h2">
            {t('Delete this account for good?')}
          </Display>
          <p className="muted mt-s">
            {t(
              'Name, e-mail address and picture are erased and can never be restored. Points and quest history stay without a name.',
            )}
          </p>
          <div className="grid2 mt">
            <Button small variant="ghost" onClick={() => setConfirmErase(false)} data-autofocus>
              {t('Keep the account')}
            </Button>
            <Button
              small
              busy={busy === 'erase'}
              onClick={() => {
                setConfirmErase(false);
                act('erase', () => api.admin.purgeUser(user.id), t('Account erased for good'));
              }}
            >
              {t('Yes, delete permanently')}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
