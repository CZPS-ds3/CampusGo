import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { errorText } from '../../api/errorText.js';
import { Button } from '../../components/Button.jsx';
import { Icon } from '../../components/icons.jsx';
import { Skeleton } from '../../components/Screen.jsx';
import { Chip, Display, EmptyState } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { t } from '../../i18n.js';

export const TYPE_MODES = [
  ['MCQ_ONLY', 'Multiple choice only'],
  ['MULTI_ONLY', 'Multi-select only'],
  ['MIXED', 'Both types'],
];
export const typeModeLabel = (mode) => t(TYPE_MODES.find(([value]) => value === mode)?.[1] ?? mode);

export function questState(quest) {
  if (quest.archived) return { tone: 'mute', label: t('Archived') };
  if (quest.isActive) return { tone: 'ok', label: t('Active') };
  return { tone: 'warn', label: t('Inactive') };
}

/** All quests with what each one still needs; new quests are made on the next page. */
export default function AdminQuests() {
  const toast = useToast();
  const [quests, setQuests] = useState(null);

  useEffect(() => {
    let alive = true;
    api.admin
      .quests()
      .then((result) => alive && setQuests(result.quests))
      .catch((error) => alive && toast.error(errorText(error)));
    return () => {
      alive = false;
    };
  }, [toast]);

  if (!quests) return <Skeleton rows={3} height={120} />;
  return (
    <section className="stack" aria-labelledby="quests-title">
      <div className="row row--between">
        <Display as="h2" size="h2" id="quests-title">
          {t('Quests')}
        </Display>
        <Button small variant="ok" to="/admin/quests/new">
          <Icon name="plus" size={18} /> {t('New quest')}
        </Button>
      </div>
      <p className="small muted">
        {t(
          'A quest is a place on the campus map with a short quiz. Students only see quests that are active and ready.',
        )}
      </p>
      {quests.length === 0 && (
        <EmptyState icon="pin" title={t('No quests yet')} body={t('Create the first quest.')} />
      )}
      <ul className="admin-list">
        {quests.map((quest) => {
          const state = questState(quest);
          return (
            <li key={quest.id} className="card stack stack--tight" data-testid="quest-card">
              <div className="row row--between row--top">
                <Display as="h3" size="h3" className="truncate">
                  {quest.name}
                </Display>
                <Chip tone={state.tone}>{state.label}</Chip>
              </div>
              <p className="small muted">
                {quest.questionCount} {t('questions')} · {t('pass')} {quest.passThreshold}/
                {quest.questionCount} · {typeModeLabel(quest.typeMode)} ·{' '}
                {Math.round(quest.effectiveTimeLimitSeconds / 60)} {t('min')}
              </p>
              <p className="small muted">
                {quest.counts.questions} {t('questions in the bank')} · {quest.counts.photos}{' '}
                {t('photos')}
              </p>
              {!quest.readiness.ready && !quest.archived && (
                <p className="small field-note field-note--error">
                  <Icon name="warn" size={18} />
                  <span>{quest.readiness.problems[0]}</span>
                </p>
              )}
              <Button small variant="sub" to={`/admin/quests/${quest.id}`}>
                {t('Open')} <Icon name="arrow" size={18} />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
