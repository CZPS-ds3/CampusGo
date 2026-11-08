import { Chip } from './ui.jsx';
import { t } from '../i18n.js';

const LABEL = {
  MCQ: () => t('Multiple choice'),
  MULTI: () => t('Multi-select'),
};

/** What kinds of questions a quest asks, shown before the quiz starts (BR50). */
export function QuestTypes({ types }) {
  const list = types?.length ? types : ['MCQ'];
  const both = list.length > 1;
  return (
    <div className="card card--flat quest-types" data-testid="quest-types">
      <p className="caption muted">{t('Question types')}</p>
      <ul className="row quest-types__list">
        {list.map((type) => (
          <li key={type}>
            <Chip tone="sub" icon={type === 'MULTI' ? 'check' : 'pin'}>
              {LABEL[type]()}
            </Chip>
          </li>
        ))}
      </ul>
      <p className="small muted">
        {both
          ? t('This quest mixes both types. You will get at least one of each.')
          : list[0] === 'MULTI'
            ? t('Tick every correct option. Only the exact right set counts.')
            : t('Choose one answer for each question.')}
      </p>
    </div>
  );
}
