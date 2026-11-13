import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { errorText } from '../../api/errorText.js';
import { Button } from '../../components/Button.jsx';
import { Icon } from '../../components/icons.jsx';
import { Skeleton } from '../../components/Screen.jsx';
import { Modal } from '../../components/Sheet.jsx';
import { Chip, Display, Input } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { t } from '../../i18n.js';
import { TYPE_MODES, questState } from './AdminQuests.jsx';
import { GeofenceEditor } from './GeofenceEditor.jsx';
import { Check, Select, Textarea } from './quest-fields.jsx';

const MAX_FACTS = 5;
const MAX_PHOTOS = 5;

const Note = ({ error, children }) =>
  children ? (
    <p
      className={`field-note${error ? ' field-note--error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      <Icon name={error ? 'warn' : 'check'} size={18} />
      <span>{children}</span>
    </p>
  ) : null;

const emptyForm = {
  name: '',
  description: '',
  mapLink: '',
  radius: '80',
  questionCount: '3',
  passThreshold: '2',
  timeLimit: '',
  hardQuestionEnabled: false,
  typeMode: 'MCQ_ONLY',
  isActive: false,
};

const formOf = (quest) => ({
  name: quest.name,
  description: quest.description,
  mapLink: quest.mapUrl ?? '',
  radius: String(quest.radius),
  questionCount: String(quest.questionCount),
  passThreshold: String(quest.passThreshold),
  timeLimit: quest.timeLimitSeconds === null ? '' : String(quest.timeLimitSeconds),
  hardQuestionEnabled: quest.hardQuestionEnabled,
  typeMode: quest.typeMode,
  isActive: quest.isActive,
});

/** The details of a quest: title, description, the Google Maps link, the numbers and the question types. */
function DetailsForm({ quest, onSaved }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(quest ? formOf(quest) : emptyForm);
  const [linkState, setLinkState] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const set = (key) => (event) =>
    setForm((now) => ({
      ...now,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    }));

  const linkChanged = !quest || form.mapLink.trim() !== (quest.mapUrl ?? '');
  // The circle is drawn at the checked link, or at the saved place while the link is unchanged.
  const place = linkState?.ok
    ? { lat: linkState.place.lat, lng: linkState.place.lng }
    : quest
      ? { lat: quest.lat, lng: quest.lng }
      : null;

  const checkLink = async () => {
    setBusy('link');
    setLinkState(null);
    try {
      const place = await api.admin.checkLink(form.mapLink);
      setLinkState({ ok: true, place });
    } catch (failure) {
      setLinkState({ ok: false, message: errorText(failure), reason: failure.details?.reason });
    } finally {
      setBusy('');
    }
  };

  const body = () => ({
    name: form.name.trim(),
    description: form.description.trim(),
    radius: Number(form.radius),
    questionCount: Number(form.questionCount),
    passThreshold: Number(form.passThreshold),
    timeLimitSeconds: form.timeLimit.trim() === '' ? null : Number(form.timeLimit),
    hardQuestionEnabled: form.hardQuestionEnabled,
    typeMode: form.typeMode,
    ...(linkChanged ? { mapLink: form.mapLink.trim() } : {}),
    ...(quest ? { isActive: form.isActive } : {}),
  });

  const save = async (event) => {
    event.preventDefault();
    setBusy('save');
    setError('');
    try {
      if (quest) {
        const saved = await api.admin.updateQuest(quest.id, body());
        toast.info(t('Saved'));
        onSaved(saved);
      } else {
        const created = await api.admin.createQuest(body());
        toast.info(t('Quest created. Now add its questions.'));
        navigate(`/admin/quests/${created.quest.id}`, { replace: true });
      }
    } catch (failure) {
      setError(errorText(failure));
      if (failure.details?.reason) {
        setLinkState({ ok: false, message: errorText(failure), reason: failure.details.reason });
      }
    } finally {
      setBusy('');
    }
  };

  return (
    <form className="card stack" noValidate onSubmit={save} aria-labelledby="details-h">
      <Display as="h2" size="h3" id="details-h">
        {t('Details')}
      </Display>
      <Input label={t('Title')} maxLength={60} value={form.name} onChange={set('name')} />
      <Textarea
        label={t('Description')}
        maxLength={1000}
        value={form.description}
        onChange={set('description')}
        hint={t('Shown to students before they start.')}
      />

      <div className="stack stack--tight">
        <Input
          label={t('Google Maps link')}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://www.google.com/maps/place/…"
          value={form.mapLink}
          onChange={(event) => {
            set('mapLink')(event);
            setLinkState(null);
          }}
          hint={t(
            'Open the place in Google Maps, copy the address from the address bar (or Share, Copy link) and paste it here. The place must be inside the map students can see.',
          )}
        />
        <div className="row">
          <Button
            small
            variant="ghost"
            busy={busy === 'link'}
            disabled={!form.mapLink.trim()}
            onClick={checkLink}
          >
            <Icon name="pin" size={18} /> {t('Check link')}
          </Button>
        </div>
        {linkState?.ok && (
          <Note>
            {t('Link is valid. The place is inside the student map.')}
            {linkState.place.warnings.length > 0 ? ` ${linkState.place.warnings.join(' ')}` : ''}
          </Note>
        )}
        {linkState && !linkState.ok && (
          <Note error>
            {t('This link cannot be used:')} {linkState.message}
          </Note>
        )}
      </div>

      <div className="grid2">
        <Input
          label={t('Number of questions')}
          type="number"
          inputMode="numeric"
          min={1}
          max={10}
          value={form.questionCount}
          onChange={set('questionCount')}
        />
        <Input
          label={t('Questions needed to pass')}
          type="number"
          inputMode="numeric"
          min={1}
          max={10}
          value={form.passThreshold}
          onChange={set('passThreshold')}
        />
        <Input
          label={t('Time limit (seconds)')}
          type="number"
          inputMode="numeric"
          min={10}
          value={form.timeLimit}
          placeholder={t('Default: 60 per question')}
          onChange={set('timeLimit')}
          hint={t('For the whole quiz. Leave empty for one minute per question.')}
        />
      </div>
      <GeofenceEditor
        value={form.radius}
        onChange={(radius) => setForm((now) => ({ ...now, radius }))}
        place={place}
        graceM={quest?.graceM}
        selfId={quest?.id ?? null}
      />
      <Select
        label={t('Question types')}
        value={form.typeMode}
        onChange={set('typeMode')}
        hint={t('Students are told this before they start.')}
      >
        {TYPE_MODES.map(([value, label]) => (
          <option key={value} value={value}>
            {t(label)}
          </option>
        ))}
      </Select>
      <Check
        label={t('Offer a hard question')}
        hint={t(
          'On the first attempt, a student who answered everything before the last question right may swap the last one for a hard question (needs 4 or more questions).',
        )}
        checked={form.hardQuestionEnabled}
        onChange={set('hardQuestionEnabled')}
      />
      {quest && (
        <Check
          label={t('Active (students can play it)')}
          hint={
            quest.readiness.ready
              ? undefined
              : t('Not ready yet. {problem}', { problem: quest.readiness.problems[0] })
          }
          checked={form.isActive}
          disabled={!quest.readiness.ready && !quest.isActive}
          onChange={set('isActive')}
        />
      )}
      <Note error>{error}</Note>
      <Button type="submit" busy={busy === 'save'}>
        {quest ? t('Save') : t('Create quest')}
      </Button>
    </form>
  );
}

function PhotosCard({ quest, photos, onChanged }) {
  const toast = useToast();
  const fileInput = useRef(null);
  const [alt, setAlt] = useState('');
  const [credit, setCredit] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const run = async (key, work, done) => {
    setBusy(key);
    setError('');
    try {
      const updated = await work();
      if (done) toast.info(done);
      onChanged(updated);
      return true;
    } catch (failure) {
      setError(errorText(failure));
      return false;
    } finally {
      setBusy('');
    }
  };

  const add = async (event) => {
    event.preventDefault();
    const added = await run(
      'add',
      () => api.admin.addPhoto(quest.id, file, alt.trim(), credit.trim()),
      t('Photo added'),
    );
    if (added) {
      setFile(null);
      setAlt('');
      setCredit('');
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <section className="card stack" aria-labelledby="photos-h">
      <Display as="h2" size="h3" id="photos-h">
        {t('Photos')} ({photos.length}/{MAX_PHOTOS})
      </Display>
      {photos.length === 0 && <p className="small muted">{t('No photos yet.')}</p>}
      <ul className="admin-photos">
        {photos.map((photo) => (
          <li key={photo.position} className="card card--tight stack stack--tight">
            <img src={photo.url} alt={photo.alt} className="admin-photos__img" />
            <p className="small">{photo.alt}</p>
            <p className="caption muted">{photo.credit}</p>
            <Button
              small
              variant="ghost"
              busy={busy === `del-${photo.position}`}
              aria-label={t('Remove photo {n}', { n: photo.position })}
              onClick={() =>
                run(
                  `del-${photo.position}`,
                  () => api.admin.deletePhoto(quest.id, photo.position),
                  t('Photo removed'),
                )
              }
            >
              {t('Remove')}
            </Button>
          </li>
        ))}
      </ul>
      {photos.length < MAX_PHOTOS && (
        <form className="stack" noValidate onSubmit={add}>
          <div className="field-wrap">
            <label htmlFor="photo-file" className="caption field-label">
              {t('Photo file (PNG, JPG or WebP)')}
            </label>
            <input
              id="photo-file"
              ref={fileInput}
              type="file"
              className="field field--file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <Input
            label={t('What the photo shows (for screen readers)')}
            maxLength={200}
            value={alt}
            onChange={(event) => setAlt(event.target.value)}
          />
          <Input
            label={t('Photo credit')}
            maxLength={200}
            value={credit}
            onChange={(event) => setCredit(event.target.value)}
          />
          <Button
            type="submit"
            variant="sub"
            busy={busy === 'add'}
            disabled={!file || !alt.trim() || !credit.trim()}
          >
            <Icon name="upload" size={18} /> {t('Add photo')}
          </Button>
        </form>
      )}
      <Note error>{error}</Note>
    </section>
  );
}

function FactsCard({ quest, facts, onChanged }) {
  const toast = useToast();
  const [list, setList] = useState(facts);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const same = JSON.stringify(list) === JSON.stringify(facts);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const cleaned = list.map((fact) => fact.trim()).filter(Boolean);
      const updated = await api.admin.saveFacts(quest.id, cleaned);
      setList(updated.facts);
      toast.info(t('Saved'));
      onChanged(updated);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack" noValidate onSubmit={save} aria-labelledby="facts-h">
      <Display as="h2" size="h3" id="facts-h">
        {t('Information for students')}
      </Display>
      <p className="small muted">
        {t('Short facts students read before the quiz (up to {n}).', { n: MAX_FACTS })}
      </p>
      {list.map((fact, index) => (
        <div key={index} className="row row--top">
          <div className="grow">
            <Input
              label={t('Fact {n}', { n: index + 1 })}
              maxLength={300}
              value={fact}
              onChange={(event) =>
                setList((now) => now.map((item, i) => (i === index ? event.target.value : item)))
              }
            />
          </div>
          <Button
            small
            variant="ghost"
            className="admin-factbtn"
            aria-label={t('Remove fact {n}', { n: index + 1 })}
            onClick={() => setList((now) => now.filter((_, i) => i !== index))}
          >
            <Icon name="close" size={18} />
          </Button>
        </div>
      ))}
      <div className="admin-actions">
        {list.length < MAX_FACTS && (
          <Button small variant="ghost" onClick={() => setList((now) => [...now, ''])}>
            <Icon name="plus" size={18} /> {t('Add a fact')}
          </Button>
        )}
        <Button small type="submit" busy={busy} disabled={same}>
          {t('Save information')}
        </Button>
      </div>
      <Note error>{error}</Note>
    </form>
  );
}

const blankQuestion = () => ({
  questionText: '',
  difficulty: 'NORMAL',
  questionType: 'MCQ',
  isActive: true,
  options: [0, 1, 2, 3].map((i) => ({ text: '', isCorrect: i === 0 })),
});

/** Pop-up to add or edit one question with its four options (BR50). */
function QuestionModal({ quest, question, onClose, onSaved }) {
  const [form, setForm] = useState(
    question
      ? {
          questionText: question.text,
          difficulty: question.difficulty,
          questionType: question.type,
          isActive: question.isActive,
          options: question.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
        }
      : blankQuestion(),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const multi = form.questionType === 'MULTI';
  const right = form.options.filter((o) => o.isCorrect).length;

  const setOption = (index, patch) =>
    setForm((now) => ({
      ...now,
      options: now.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    }));

  // Ticking a right answer of a single-choice question clears the others.
  const markRight = (index, checked) =>
    setForm((now) => ({
      ...now,
      options: now.options.map((o, i) =>
        now.questionType === 'MCQ'
          ? { ...o, isCorrect: i === index }
          : i === index
            ? { ...o, isCorrect: checked }
            : o,
      ),
    }));

  const changeType = (event) => {
    const questionType = event.target.value;
    setForm((now) => ({
      ...now,
      questionType,
      options:
        questionType === 'MCQ'
          ? now.options.map((o, i) => ({
              ...o,
              isCorrect:
                i ===
                Math.max(
                  0,
                  now.options.findIndex((x) => x.isCorrect),
                ),
            }))
          : now.options,
    }));
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      ...form,
      questionText: form.questionText.trim(),
      options: form.options.map((o) => ({ ...o, text: o.text.trim() })),
    };
    try {
      const updated = question
        ? await api.admin.updateQuestion(quest.id, question.id, body)
        : await api.admin.createQuestion(quest.id, body);
      onSaved(updated);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const title = question ? t('Edit question') : t('New question');
  return (
    <Modal title={title} onClose={onClose}>
      <form className="stack" noValidate onSubmit={save}>
        <Display as="h2" size="h2">
          {title}
        </Display>
        <Textarea
          label={t('Question')}
          maxLength={500}
          value={form.questionText}
          data-autofocus
          onChange={(event) => setForm((now) => ({ ...now, questionText: event.target.value }))}
        />
        <div className="grid2">
          <Select label={t('Type')} value={form.questionType} onChange={changeType}>
            <option value="MCQ">{t('Multiple choice')}</option>
            <option value="MULTI">{t('Multi-select')}</option>
          </Select>
          <Select
            label={t('Difficulty')}
            value={form.difficulty}
            onChange={(event) => setForm((now) => ({ ...now, difficulty: event.target.value }))}
          >
            <option value="NORMAL">{t('Normal')}</option>
            <option value="HARD">{t('Hard')}</option>
          </Select>
        </div>
        <fieldset className="stack stack--tight admin-options">
          <legend className="caption muted">
            {multi
              ? t('Four options. Tick the 2 or 3 correct ones.')
              : t('Four options. Tick the one correct one.')}
          </legend>
          {form.options.map((option, index) => (
            <div key={index} className="row row--top">
              <label className="admin-options__tick">
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  name="correct"
                  checked={option.isCorrect}
                  onChange={(event) => markRight(index, event.target.checked)}
                  aria-label={t('Option {n} is correct', { n: index + 1 })}
                />
              </label>
              <div className="grow">
                <Input
                  label={t('Option {n}', { n: index + 1 })}
                  maxLength={255}
                  value={option.text}
                  onChange={(event) => setOption(index, { text: event.target.value })}
                />
              </div>
            </div>
          ))}
        </fieldset>
        <Check
          label={t('Use this question')}
          checked={form.isActive}
          onChange={(event) => setForm((now) => ({ ...now, isActive: event.target.checked }))}
        />
        <p className="small muted">{t('Correct options ticked: {n}', { n: right })}</p>
        <Note error>{error}</Note>
        <div className="grid2">
          <Button small variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button small type="submit" busy={busy}>
            {t('Save question')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function QuestionsCard({ quest, questions, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await api.admin.deleteQuestion(quest.id, deleting.id);
      toast.info(
        updated.result === 'archived'
          ? t('Question archived (students already saw it).')
          : t('Question deleted'),
      );
      if (updated.deactivated)
        toast.info(t('The quest was switched off: it needs more questions.'));
      setDeleting(null);
      onChanged(updated);
    } catch (failure) {
      setError(errorText(failure));
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack" aria-labelledby="questions-h">
      <div className="row row--between">
        <Display as="h2" size="h3" id="questions-h">
          {t('Questions')} ({questions.length})
        </Display>
        <Button small variant="ok" onClick={() => setEditing('new')}>
          <Icon name="plus" size={18} /> {t('Add question')}
        </Button>
      </div>
      {quest.readiness.problems.map((problem) => (
        <Note key={problem} error>
          {problem}
        </Note>
      ))}
      <Note error>{error}</Note>
      {questions.length === 0 && <p className="small muted">{t('No questions yet.')}</p>}
      <ul className="admin-list">
        {questions.map((question) => (
          <li
            key={question.id}
            className="card card--tight stack stack--tight"
            data-testid="question-row"
          >
            <div className="row row--between row--top">
              <p className="strong">{question.text}</p>
              <span className="admin-user__chips">
                <Chip tone="sub">
                  {question.type === 'MULTI' ? t('Multi-select') : t('Multiple choice')}
                </Chip>
                <Chip tone={question.difficulty === 'HARD' ? 'warn' : 'mute'}>
                  {question.difficulty === 'HARD' ? t('Hard') : t('Normal')}
                </Chip>
                {!question.isActive && <Chip tone="mute">{t('Not in use')}</Chip>}
              </span>
            </div>
            <ul className="small">
              {question.options.map((option) => (
                <li key={option.id}>
                  {option.isCorrect ? '✓ ' : '· '}
                  {option.text}
                </li>
              ))}
            </ul>
            {question.images?.length > 0 && (
              <ul className="admin-qphotos" aria-label={t('Photos of this question')}>
                {question.images.map((image) => (
                  <li key={image.position}>
                    <img src={image.url} alt={image.alt} loading="lazy" />
                    <span className="caption muted">
                      {image.shown === 'question' ? t('With the question') : t('After answering')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="admin-actions">
              <Button small variant="ghost" onClick={() => setEditing(question)}>
                {t('Edit')}
              </Button>
              <Button small variant="ghost" onClick={() => setDeleting(question)}>
                {t('Delete')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <QuestionModal
          quest={quest}
          question={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setEditing(null);
            toast.info(t('Question saved'));
            if (updated.deactivated) {
              toast.info(t('The quest was switched off: it needs more questions.'));
            }
            onChanged(updated);
          }}
        />
      )}
      {deleting && (
        <Modal title={t('Confirm delete')} onClose={() => setDeleting(null)}>
          <Display as="h2" size="h2">
            {t('Delete this question?')}
          </Display>
          <p className="muted mt-s">
            {t(
              'A question that students already answered is archived instead, so their history stays.',
            )}
          </p>
          <div className="grid2 mt">
            <Button small variant="ghost" onClick={() => setDeleting(null)} data-autofocus>
              {t('Cancel')}
            </Button>
            <Button small busy={busy} onClick={remove}>
              {t('Delete question')}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** One quest, or the form for a new one (`/admin/quests/new`). */
export default function AdminQuest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = id === 'new';
  const [data, setData] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (isNew) return;
    api.admin
      .quest(id)
      .then(setData)
      .catch((error) => {
        toast.error(errorText(error));
        navigate('/admin/quests', { replace: true });
      });
  }, [id, isNew, navigate, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = (updated) =>
    setData({
      quest: updated.quest,
      facts: updated.facts,
      photos: updated.photos,
      questions: updated.questions,
    });

  const remove = async () => {
    setBusy(true);
    try {
      const { result } = await api.admin.deleteQuest(id);
      toast.info(
        result === 'archived'
          ? t('Quest archived (students already played it).')
          : t('Quest deleted'),
      );
      navigate('/admin/quests', { replace: true });
    } catch (failure) {
      toast.error(errorText(failure));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      refresh(await api.admin.restoreQuest(id));
      toast.info(t('Quest restored. It is switched off until you activate it.'));
    } catch (failure) {
      toast.error(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  if (isNew) {
    return (
      <section className="stack" aria-labelledby="quest-title">
        <Link to="/admin/quests" className="link">
          <Icon name="back" size={18} /> {t('All quests')}
        </Link>
        <Display as="h2" size="h2" id="quest-title">
          {t('New quest')}
        </Display>
        <DetailsForm />
      </section>
    );
  }
  if (!data) return <Skeleton rows={3} height={120} />;

  const { quest } = data;
  const state = questState(quest);
  return (
    <section className="stack" aria-labelledby="quest-title">
      <Link to="/admin/quests" className="link">
        <Icon name="back" size={18} /> {t('All quests')}
      </Link>
      <div className="row row--between row--top">
        <Display as="h2" size="h2" id="quest-title">
          {quest.name}
        </Display>
        <Chip tone={state.tone}>{state.label}</Chip>
      </div>

      {quest.archived ? (
        <div className="card stack" data-testid="archived-panel">
          <p>{t('This quest is archived. Students cannot see it, and their history is kept.')}</p>
          <Button small variant="ok" busy={busy} onClick={restore}>
            {t('Restore quest')}
          </Button>
        </div>
      ) : (
        <>
          <DetailsForm key={JSON.stringify(quest)} quest={quest} onSaved={refresh} />
          <PhotosCard quest={quest} photos={data.photos} onChanged={refresh} />
          <FactsCard
            key={data.facts.join('|')}
            quest={quest}
            facts={data.facts}
            onChanged={refresh}
          />
          <QuestionsCard quest={quest} questions={data.questions} onChanged={refresh} />
        </>
      )}

      <div className="card stack danger-zone">
        <Display as="h2" size="h3">
          {t('Delete quest')}
        </Display>
        <p className="small muted">
          {quest.hasHistory
            ? t('Students already played this quest, so it is archived and can be restored.')
            : t('Nobody played this quest yet, so it is deleted for good.')}
        </p>
        <Button small variant="dark" onClick={() => setConfirm(true)}>
          {t('Delete quest')}
        </Button>
      </div>
      {confirm && (
        <Modal title={t('Confirm delete')} onClose={() => setConfirm(false)}>
          <Display as="h2" size="h2">
            {t('Delete the quest {name}?', { name: quest.name })}
          </Display>
          <p className="muted mt-s">
            {quest.hasHistory
              ? t('It is hidden from students and archived. You can restore it later.')
              : t('The quest and its questions are deleted for good.')}
          </p>
          <div className="grid2 mt">
            <Button small variant="ghost" onClick={() => setConfirm(false)} data-autofocus>
              {t('Cancel')}
            </Button>
            <Button small busy={busy} onClick={remove}>
              {t('Delete quest')}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
