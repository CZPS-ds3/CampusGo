import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { errorText } from '../../api/errorText.js';
import { Button } from '../../components/Button.jsx';
import { Icon } from '../../components/icons.jsx';
import { Skeleton } from '../../components/Screen.jsx';
import { Chip, Display, EmptyState, Input } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { formatNumber, t } from '../../i18n.js';
import { STATUS_TONE, formatDateTime, statusLabel } from './format.js';

const FILTERS = ['', 'active', 'blocked', 'archived', 'deleted', 'reported'];

function NewUser({ onCreated }) {
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', nickname: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.admin.createUser({ ...form, nickname: form.nickname || undefined });
      setForm({ email: '', firstName: '', lastName: '', nickname: '' });
      onCreated();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack" noValidate onSubmit={submit}>
      <Display as="h2" size="h3">
        {t('New account')}
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
      <Button type="submit" variant="ok" busy={busy}>
        <Icon name="plus" /> {t('Create account')}
      </Button>
    </form>
  );
}

export default function AdminUsers() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [users, setUsers] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.admin
      .users({ q: q.trim(), status })
      .then((result) => setUsers(result.users))
      .catch((error) => toast.error(errorText(error)));
  }, [q, status, toast]);

  useEffect(() => {
    const id = setTimeout(load, 200);
    return () => clearTimeout(id);
  }, [load]);

  return (
    <section className="stack" aria-labelledby="users-title">
      <div className="row row--between">
        <Display as="h2" size="h2" id="users-title">
          {t('Users')}
        </Display>
        <Button small variant="sub" onClick={() => setCreating((open) => !open)}>
          <Icon name="plus" /> {t('New account')}
        </Button>
      </div>
      {creating && (
        <NewUser
          onCreated={() => {
            toast.info(t('Account created'));
            setCreating(false);
            load();
          }}
        />
      )}
      <div className="admin-filters">
        <Input
          label={t('Search name or email')}
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <div className="field-wrap">
          <label htmlFor="user-status" className="caption field-label">
            {t('Status')}
          </label>
          <select
            id="user-status"
            className="field"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {FILTERS.map((value) => (
              <option key={value} value={value}>
                {value === ''
                  ? t('All')
                  : value === 'reported'
                    ? t('Reported')
                    : statusLabel(value)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {users && (
        <p className="small muted" aria-live="polite">
          {users.length} {t('users')}
        </p>
      )}
      {!users && <Skeleton rows={4} height={88} />}
      {users?.length === 0 && (
        <EmptyState icon="team" title={t('No users found')} body={t('Try another search.')} />
      )}
      <ul className="admin-list">
        {users?.map((user) => (
          <li key={user.id}>
            <Link to={`/admin/users/${user.id}`} className="card admin-user">
              <div className="row row--between row--top">
                <div className="grow">
                  <p className="strong truncate">
                    {user.firstName} {user.lastName}
                    {user.nickname ? <span className="muted"> · {user.nickname}</span> : null}
                  </p>
                  <p className="small muted truncate">{user.email}</p>
                </div>
                <span className="admin-user__chips">
                  <Chip tone={STATUS_TONE[user.status]}>{statusLabel(user.status)}</Chip>
                  {user.reported && <Chip tone="warn">{t('Reported')}</Chip>}
                  {user.role === 'admin' && <Chip tone="sub">{t('Admin')}</Chip>}
                </span>
              </div>
              <p className="small muted">
                <span className="mono">{formatNumber(user.totalPoints)}</span> {t('PTS')} ·{' '}
                {user.questsPassed}/8 {t('quests')} · {user.teamName ?? t('No team yet')} ·{' '}
                {t('Last login')} {formatDateTime(user.lastLoginAt)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
