import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { errorText } from '../../api/errorText.js';
import { Button } from '../../components/Button.jsx';
import { Icon } from '../../components/icons.jsx';
import { Skeleton } from '../../components/Screen.jsx';
import { Display, Input } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { t } from '../../i18n.js';

/** Name rules: the built-in German and English word list, extra words, and a tester. */
export default function AdminNames() {
  const toast = useToast();
  const [terms, setTerms] = useState(null);
  const [term, setTerm] = useState('');
  const [mode, setMode] = useState('token');
  const [sample, setSample] = useState('');
  const [verdict, setVerdict] = useState(null);

  const load = useCallback(() => {
    api.admin
      .names()
      .then(setTerms)
      .catch((error) => toast.error(errorText(error)));
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (work, done) => {
    try {
      await work();
      if (done) toast.info(done);
      load();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const test = async (event) => {
    event.preventDefault();
    try {
      const { blockedBy } = await api.admin.testName(sample);
      setVerdict(blockedBy ? { blocked: true, by: blockedBy } : { blocked: false });
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  if (!terms) return <Skeleton rows={3} height={110} />;
  return (
    <section className="stack" aria-labelledby="names-title">
      <Display as="h2" size="h2" id="names-title">
        {t('Name rules')}
      </Display>
      <p className="muted">
        {t(
          'Nicknames, names and team names are checked in German and English. Whole words are matched, so harmless names such as Cass or Classic stay allowed.',
        )}
      </p>

      <form className="card stack" noValidate onSubmit={test}>
        <Display as="h3" size="h3">
          {t('Test a name')}
        </Display>
        <Input
          label={t('Name')}
          value={sample}
          onChange={(event) => setSample(event.target.value)}
        />
        <Button type="submit" variant="sub" disabled={!sample.trim()}>
          {t('Check')}
        </Button>
        {verdict && (
          <p className={`field-note${verdict.blocked ? ' field-note--error' : ''}`} role="status">
            <Icon name={verdict.blocked ? 'warn' : 'check'} size={18} />
            <span>
              {verdict.blocked
                ? t('Not allowed (matches “{word}”).', { word: verdict.by })
                : t('Allowed.')}
            </span>
          </p>
        )}
      </form>

      <form
        className="card stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            await api.admin.addTerm(term.trim(), mode);
            setTerm('');
          }, t('Word added'));
        }}
      >
        <Display as="h3" size="h3">
          {t('Add a word')}
        </Display>
        <Input
          label={t('Word')}
          maxLength={60}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <div className="field-wrap">
          <label htmlFor="term-mode" className="caption field-label">
            {t('Match')}
          </label>
          <select
            id="term-mode"
            className="field"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="token">{t('Whole word only (safer for names)')}</option>
            <option value="substring">{t('Anywhere inside a word')}</option>
          </select>
        </div>
        <Button type="submit" variant="ok" disabled={term.trim().length < 2}>
          <Icon name="plus" /> {t('Add word')}
        </Button>
      </form>

      <section className="card stack" aria-labelledby="custom-h">
        <Display as="h3" size="h3" id="custom-h">
          {t('Your words')}
        </Display>
        {terms.custom.length === 0 && <p className="muted small">{t('No extra words yet.')}</p>}
        <ul className="admin-log">
          {terms.custom.map((item) => (
            <li key={item.term}>
              <span className="mono">{item.term}</span>
              <button
                type="button"
                className="linkbtn"
                onClick={() => run(() => api.admin.removeTerm(item.term), t('Word removed'))}
              >
                {t('Remove')}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <details className="card">
        <summary className="strong">{t('Built-in word list')}</summary>
        <p className="small muted mt-s">{t('Blocked anywhere inside a word:')}</p>
        <p className="mono small">{terms.builtIn.substring.join(', ')}</p>
        <p className="small muted mt-s">{t('Blocked as a whole word:')}</p>
        <p className="mono small">{terms.builtIn.token.join(', ')}</p>
      </details>
    </section>
  );
}
