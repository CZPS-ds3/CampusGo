import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { errorText } from '../../api/errorText.js';
import { Button } from '../../components/Button.jsx';
import { Icon } from '../../components/icons.jsx';
import { Skeleton } from '../../components/Screen.jsx';
import { Modal } from '../../components/Sheet.jsx';
import { Chip, Display } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { t } from '../../i18n.js';

/**
 * Run-time settings (BR52, BR55). The code preview shows every login code in a test inbox on the login page
 * (and in the backend terminal) in addition to the e-mail. Handy for testing, but while it is on anyone can log
 * in as anyone, so it must be off for the real pilot. Turning it on asks first; turning it off does not.
 */
export default function AdminSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(() => {
    api.admin
      .settings()
      .then((result) => setSettings(result.settings))
      .catch((failure) => setError(errorText(failure)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (otpPreview) => {
    setBusy(true);
    setError('');
    try {
      const result = await api.admin.saveSettings({ otpPreview });
      setSettings(result.settings);
      toast.info(otpPreview ? t('Code preview is on') : t('Code preview is off'));
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  if (!settings && !error) return <Skeleton rows={2} height={120} />;

  const on = Boolean(settings?.otpPreview);
  return (
    <section className="stack" aria-labelledby="settings-title">
      <Display as="h2" size="h2" id="settings-title">
        {t('Settings')}
      </Display>
      {error && (
        <p className="field-note field-note--error" role="alert">
          <Icon name="warn" size={18} />
          <span>{error}</span>
        </p>
      )}
      {settings && (
        <article className="card stack" aria-labelledby="preview-title">
          <div className="row row--between row--top">
            <Display as="h3" size="h3" id="preview-title">
              {t('Login code preview')}
            </Display>
            <Chip tone={on ? 'warn' : 'ok'}>{on ? t('On') : t('Off')}</Chip>
          </div>
          <p className="muted">
            {t(
              'While this is on, every login code is also shown in a test inbox on the login page and printed in the backend terminal. The e-mail is still sent when SMTP is set up.',
            )}
          </p>
          <p className="small">
            <Icon name="mail" size={16} />{' '}
            {settings.mailConfigured
              ? t('E-mail sending is set up (SMTP).')
              : t(
                  'E-mail sending is not set up (no SMTP_HOST): codes can only reach people through the preview.',
                )}
          </p>
          {on && (
            <p className="field-note field-note--error" role="status">
              <Icon name="warn" size={18} />
              <span>
                {t(
                  'Anyone can log in as anyone while the preview is on. Turn it off before real students use the app.',
                )}
              </span>
            </p>
          )}
          <div className="row row--between">
            <span className="strong" id="preview-switch">
              {t('Show login codes on the login page')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-labelledby="preview-switch"
              className="switch"
              disabled={busy}
              onClick={() => (on ? save(false) : setConfirm(true))}
            />
          </div>
        </article>
      )}
      {confirm && (
        <Modal title={t('Confirm the code preview')} onClose={() => setConfirm(false)}>
          <Display as="h2" size="h2">
            {t('Show login codes on the login page?')}
          </Display>
          <p className="muted mt-s">
            {t(
              'Use this only for testing. Anyone who types a school address can then log in as that person.',
            )}
          </p>
          <div className="grid2 mt">
            <Button small variant="ghost" onClick={() => setConfirm(false)} data-autofocus>
              {t('Cancel')}
            </Button>
            <Button small busy={busy} onClick={() => save(true)}>
              {t('Turn on')}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
