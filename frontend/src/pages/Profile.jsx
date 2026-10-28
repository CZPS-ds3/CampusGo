import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Avatar, PRESET_COUNT } from '../components/Avatar.jsx';
import { Button } from '../components/Button.jsx';
import { Icon } from '../components/icons.jsx';
import { Page } from '../components/Screen.jsx';
import { Modal } from '../components/Sheet.jsx';
import { Display, Logo } from '../components/ui.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { FONT_SCALE, formatNumber, setSettings, t, useSettings } from '../i18n.js';

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const SIZES = [
  ['s', 'S', 'Small'],
  ['m', 'M', 'Medium'],
  ['l', 'L', 'Large'],
  ['xl', 'XL', 'Extra large'],
];

function Preferences() {
  const { theme, size, lang } = useSettings();
  return (
    <section className="card stack" aria-labelledby="prefs-h">
      <Display as="h2" size="h3" id="prefs-h">
        {t('Preferences')}
      </Display>
      <div className="row row--between">
        <div>
          <p className="strong">{t('Dark mode')}</p>
          <p className="small muted">{t('Easier on the eyes at night.')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label={t('Dark mode')}
          className="switch"
          onClick={() => setSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
        />
      </div>
      <div>
        <div className="row row--between">
          <p className="strong">{t('Font size')}</p>
          <span className="small muted">
            {t(SIZES.find((s) => s[0] === size)[2])} · {Math.round(FONT_SCALE[size] * 100)}%
          </span>
        </div>
        <div className="seg seg--4 mt-s" role="radiogroup" aria-label={t('Font size')}>
          {SIZES.map(([id, short, name]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={size === id}
              aria-label={t(name)}
              onClick={() => setSettings({ size: id })}
            >
              {short}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="strong">{t('Language')}</p>
        <div className="seg seg--2 mt-s" role="radiogroup" aria-label={t('Language')}>
          {[
            ['de', 'Deutsch'],
            ['en', 'English'],
          ].map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={lang === id}
              onClick={() => setSettings({ lang: id })}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const toast = useToast();
  const { student, refresh, logout } = useSession();
  const [cleared, setCleared] = useState(null);
  const [team, setTeam] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.checkpoints(), api.myTeam()])
      .then(([list, mine]) => {
        if (!alive) return;
        setCleared({
          done: list.checkpoints.filter((c) => c.completed).length,
          total: list.checkpoints.length,
        });
        setTeam(mine.team);
      })
      .catch(() => {
        // The stats are a bonus on this screen; the profile itself still works without them.
      });
    return () => {
      alive = false;
    };
  }, []);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    // The server checks again; this only saves a round trip.
    if (file.size > MAX_BYTES) {
      setError(t('That picture is larger than 2 MB.'));
      return;
    }
    if (!TYPES.includes(file.type)) {
      setError(t('Please choose a PNG, JPG or WebP picture.'));
      return;
    }
    setBusy(true);
    try {
      await api.uploadPicture(file);
      await refresh();
      toast.info(t('Picture saved.'));
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const pickPreset = async (preset) => {
    try {
      await api.setAvatarPreset(preset);
      await refresh();
    } catch (failure) {
      setError(errorText(failure));
    }
  };

  const leave = async () => {
    setConfirm(false);
    await logout();
    navigate('/', { replace: true });
  };

  const removeAccount = async () => {
    setDeleting(true);
    try {
      await api.deleteAccount();
      setConfirmDelete(false);
      await logout();
      navigate('/', { replace: true });
    } catch (failure) {
      setConfirmDelete(false);
      setError(errorText(failure));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Page className="page--profile" wide>
      <div className="profile__hero">
        <Avatar
          size={96}
          name={student.displayName}
          avatar={{ url: student.pictureUrl, preset: student.avatarPreset }}
          label={t('Your avatar')}
        />
        <Display as="h1" size="h1" tabIndex={-1} className="block">
          {student.nickname || `${student.firstName} ${student.lastName}`}
        </Display>
        <p className="small muted">
          {student.firstName} {student.lastName}
        </p>
        <p className="small muted break">{student.email}</p>
      </div>

      <div className="twocol">
        <div className="stack">
          <div className="grid2">
            <div className="card card--tight">
              <p className="caption muted">{t('Points')}</p>
              <p className="mono h2 accent">{formatNumber(student.totalPoints)}</p>
            </div>
            <div className="card card--tight">
              <p className="caption muted">{t('Cleared')}</p>
              <p className="mono h2 ok-text">
                {cleared ? `${cleared.done}/${cleared.total}` : '–'}
              </p>
            </div>
          </div>
          <div className="card card--tight row row--between">
            <span className="caption muted">{t('Team')}</span>
            <span className="strong truncate">{team?.name ?? t('No team yet')}</span>
          </div>
          <section className="card stack" aria-labelledby="avatar-h">
            <Display as="h2" size="h3" id="avatar-h">
              {t('Your player card')}
            </Display>
            <div className="presets" role="radiogroup" aria-label={t('Preset avatars')}>
              {Array.from({ length: PRESET_COUNT }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={!student.pictureUrl && student.avatarPreset === i}
                  aria-label={t('Avatar {n}', { n: i + 1 })}
                  className="preset"
                  onClick={() => pickPreset(i)}
                >
                  <Avatar size={44} avatar={{ preset: i }} />
                </button>
              ))}
            </div>
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              accept="image/png,image/jpeg,image/webp"
              tabIndex={-1}
              aria-label={t('Upload profile picture')}
              onChange={upload}
            />
            <Button variant="ghost" busy={busy} onClick={() => fileInput.current?.click()}>
              <Icon name="camera" /> {t('Change picture')}
            </Button>
            <p className="small muted">{t('PNG, JPG or WebP, up to 2 MB.')}</p>
            {error && (
              <p className="field-note field-note--error" role="alert">
                <Icon name="warn" size={18} />
                <span>{error}</span>
              </p>
            )}
          </section>
          <p className="small muted">
            {student.locationConsent
              ? t('You agreed to the location notice.')
              : t(
                  'You have not agreed to the location notice yet. We ask when you check in at a checkpoint.',
                )}
          </p>
        </div>
        <div className="stack">
          <Preferences />
          <Button onClick={() => setConfirm(true)}>
            <Icon name="logout" /> {t('Sign out')}
          </Button>
          {student.role !== 'admin' && (
            <section className="card stack danger-zone" aria-labelledby="danger-h">
              <Display as="h2" size="h3" id="danger-h">
                {t('Delete my account')}
              </Display>
              <p className="small muted">
                {t(
                  'This removes your name, picture and e-mail from the game and takes you out of your team. It cannot be undone.',
                )}
              </p>
              <Button small variant="ghost" onClick={() => setConfirmDelete(true)}>
                {t('Delete my account')}
              </Button>
            </section>
          )}
          <div className="profile__logo">
            <Logo height={40} />
          </div>
        </div>
      </div>

      {confirmDelete && (
        <Modal title={t('Confirm account deletion')} onClose={() => setConfirmDelete(false)}>
          <Display as="h2" size="h2">
            {t('Delete your account?')}
          </Display>
          <p className="muted mt-s">
            {t('Your points and quests disappear from the rankings. You can sign up again later.')}
          </p>
          <div className="grid2 mt">
            <Button small variant="ghost" onClick={() => setConfirmDelete(false)} data-autofocus>
              {t('Keep my account')}
            </Button>
            <Button small busy={deleting} onClick={removeAccount}>
              {t('Yes, delete it')}
            </Button>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal title={t('Confirm sign out')} onClose={() => setConfirm(false)}>
          <Display as="h2" size="h2">
            {t('Sign out?')}
          </Display>
          <p className="muted mt-s">
            {t('You will need a new code to get back in. Your progress stays saved.')}
          </p>
          <div className="grid2 mt">
            <Button small variant="ghost" onClick={() => setConfirm(false)} data-autofocus>
              {t('Stay')}
            </Button>
            <Button small onClick={leave}>
              {t('Sign out')}
            </Button>
          </div>
        </Modal>
      )}
    </Page>
  );
}
