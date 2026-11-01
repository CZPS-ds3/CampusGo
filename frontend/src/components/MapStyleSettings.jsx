import { useEffect, useId, useState } from 'react';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { contrastRatio, normalizeColor, parseColor, toHex } from '../colors.js';
import { useToast } from '../hooks/useToast.jsx';
import { t, useSettings } from '../i18n.js';
import {
  DEFAULT_MAP_STYLE,
  PRESETS,
  cleanStyle,
  resetMapStyle,
  saveMapStyle,
  styleVariables,
  useMapStyle,
} from '../mapStyle.js';
import { Button } from './Button.jsx';
import { Icon } from './icons.jsx';

const BASES = [
  ['follow', 'Follow the app'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];
const PRESET_NAMES = {
  classic: 'Classic',
  ocean: 'Ocean',
  forest: 'Forest',
  sunset: 'Sunset',
  mono: 'Mono',
};
const GROUND = { light: '#eef0f2', dark: '#181d22' };
const MIN_CONTRAST = 3;

const channelOf = (event) =>
  Math.max(0, Math.min(255, Math.round(Number(event.target.value) || 0)));

/** Edits the one colour that is selected: picker, a text field for #rrggbb or rgb(r, g, b), and R, G, B. */
function ColourEditor({ label, value, onChange, ground }) {
  const id = useId();
  const [text, setText] = useState(value);
  const rgb = parseColor(value);
  const bad = normalizeColor(text) === null;
  const low = contrastRatio(value, ground) < MIN_CONTRAST;

  useEffect(() => {
    setText((now) => (normalizeColor(now) === value ? now : value));
  }, [value]);

  const setChannel = (key) => (event) => onChange(toHex({ ...rgb, [key]: channelOf(event) }));

  return (
    <div className="mapstyle__editor" data-testid={`colour-${label}`}>
      <div className="mapstyle__editor-row">
        <input
          type="color"
          className="mapstyle__picker"
          value={value}
          aria-label={t('{name}: pick a colour', { name: label })}
          onChange={(event) => onChange(normalizeColor(event.target.value))}
        />
        <div className="mapstyle__field mapstyle__field--hex">
          <label htmlFor={`${id}-hex`} className="caption">
            {t('Colour code')}
          </label>
          <input
            id={`${id}-hex`}
            className={`field field--tight${bad ? ' field-error' : ''}`}
            value={text}
            spellCheck={false}
            autoCapitalize="none"
            aria-invalid={bad || undefined}
            onChange={(event) => {
              setText(event.target.value);
              const next = normalizeColor(event.target.value);
              if (next) onChange(next);
            }}
          />
        </div>
        {['r', 'g', 'b'].map((key) => (
          <div key={key} className="mapstyle__field">
            <label htmlFor={`${id}-${key}`} className="caption">
              {key.toUpperCase()} (0–255)
            </label>
            <input
              id={`${id}-${key}`}
              className="field field--tight"
              type="number"
              inputMode="numeric"
              min={0}
              max={255}
              value={rgb[key]}
              onChange={setChannel(key)}
            />
          </div>
        ))}
      </div>
      {bad && (
        <p className="field-note field-note--error" role="alert">
          <Icon name="warn" size={18} />
          <span>{t('Use a colour like #1a2b3c or rgb(26, 43, 60).')}</span>
        </p>
      )}
      {!bad && low && (
        <p className="field-note" role="status">
          <Icon name="warn" size={18} />
          <span>{t('This colour is hard to see on the map.')}</span>
        </p>
      )}
    </div>
  );
}

function Preview({ style }) {
  const variables = Object.fromEntries(
    Object.entries(styleVariables(style, { keepDefaults: true })).filter(
      ([, v]) => v !== undefined,
    ),
  );
  return (
    <div
      className="mapstyle__preview"
      data-base={style.base === 'follow' ? undefined : style.base}
      style={variables}
      role="img"
      aria-label={t('Preview of your map style')}
    >
      <span className="mapstyle__route" />
      <span className="mapstyle__preview-pins" aria-hidden="true">
        <span className="mapstyle__pin mapstyle__pin--open" />
        <span className="mapstyle__pin mapstyle__pin--done" />
        <span className="mapstyle__pin mapstyle__pin--locked" />
        <span className="mapstyle__pin mapstyle__pin--selected" />
      </span>
    </div>
  );
}

/**
 * Map style on the profile (BR48): base (light, dark or follow the app), presets and free colours.
 * One style is saved on the account, so it follows the student to other devices. The card is closed until
 * opened and edits one colour at a time, so it stays short on a phone.
 */
export function MapStyleSettings() {
  const toast = useToast();
  const { theme } = useSettings();
  const saved = useMapStyle();
  const [draft, setDraft] = useState(saved);
  const [picked, setPicked] = useState('highlight');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  // The account's style arrives after sign-in.
  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const changed = JSON.stringify(cleanStyle(draft)) !== JSON.stringify(saved);
  const ground = GROUND[draft.base === 'follow' ? theme : draft.base] ?? GROUND.light;

  const colours = [
    {
      id: 'tint',
      label: t('Map tint'),
      value: draft.tint.color,
      set: (hex) => ({ tint: { color: hex, strength: draft.tint.strength || 30 } }),
    },
    {
      id: 'open',
      label: t('Open checkpoints'),
      value: draft.pins.open,
      set: (hex) => ({ pins: { ...draft.pins, open: hex } }),
    },
    {
      id: 'done',
      label: t('Cleared checkpoints'),
      value: draft.pins.done,
      set: (hex) => ({ pins: { ...draft.pins, done: hex } }),
    },
    {
      id: 'locked',
      label: t('Locked checkpoints'),
      value: draft.pins.locked,
      set: (hex) => ({ pins: { ...draft.pins, locked: hex } }),
    },
    {
      id: 'highlight',
      label: t('Highlight (selected checkpoint)'),
      value: draft.highlight,
      set: (hex) => ({ highlight: hex }),
    },
    {
      id: 'route',
      label: t('Walking route'),
      value: draft.route,
      set: (hex) => ({ route: hex }),
    },
  ];
  const current = colours.find((c) => c.id === picked);

  const run = async (key, work, done) => {
    setBusy(key);
    setError('');
    try {
      await work();
      toast.info(done);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy('');
    }
  };

  return (
    <details className="card mapstyle" data-testid="map-style">
      <summary className="mapstyle__summary">
        <span className="display h3">{t('Map style')}</span>
        <span className="small muted">{t('Open to change colours')}</span>
      </summary>
      <div className="mapstyle__body">
        <p className="small muted">
          {t('One map style is saved on your account and follows you to other devices.')}
        </p>
        <Preview style={draft} />

        <div className="seg seg--3" role="radiogroup" aria-label={t('Map base')}>
          {BASES.map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={draft.base === id}
              onClick={() => setDraft((now) => cleanStyle({ ...now, base: id }))}
            >
              {t(name)}
            </button>
          ))}
        </div>

        <ul className="mapstyle__presets" aria-label={t('Presets')}>
          {Object.entries(PRESETS).map(([name, preset]) => (
            <li key={name}>
              <button
                type="button"
                className="mapstyle__preset"
                aria-pressed={draft.preset === name}
                onClick={() => setDraft(cleanStyle({ ...preset, base: draft.base }))}
              >
                <span className="mapstyle__swatches" aria-hidden="true">
                  {[preset.pins.open, preset.pins.done, preset.highlight].map((colour, i) => (
                    <span key={i} className="mapstyle__swatch" style={{ background: colour }} />
                  ))}
                </span>
                <span className="small strong">{t(PRESET_NAMES[name])}</span>
              </button>
            </li>
          ))}
        </ul>

        <ul className="mapstyle__chips" aria-label={t('Colours')}>
          {colours.map((colour) => (
            <li key={colour.id}>
              <button
                type="button"
                className="mapstyle__chip"
                aria-pressed={picked === colour.id}
                onClick={() => setPicked(colour.id)}
              >
                <span
                  className="mapstyle__swatch"
                  style={{ background: colour.value }}
                  aria-hidden="true"
                />
                <span className="small">{colour.label}</span>
              </button>
            </li>
          ))}
        </ul>

        <ColourEditor
          key={picked}
          label={current.label}
          value={current.value}
          ground={ground}
          onChange={(hex) =>
            setDraft((now) => cleanStyle({ ...now, preset: 'custom', ...current.set(hex) }))
          }
        />
        {picked === 'tint' && (
          <div className="mapstyle__field">
            <label htmlFor="tint-strength" className="caption">
              {t('Tint strength: {n}%', { n: draft.tint.strength })}
            </label>
            <input
              id="tint-strength"
              type="range"
              min={0}
              max={100}
              step={5}
              value={draft.tint.strength}
              onChange={(event) =>
                setDraft((now) =>
                  cleanStyle({
                    ...now,
                    preset: 'custom',
                    tint: { ...now.tint, strength: Number(event.target.value) },
                  }),
                )
              }
            />
          </div>
        )}

        {error && (
          <p className="field-note field-note--error" role="alert">
            <Icon name="warn" size={18} />
            <span>{error}</span>
          </p>
        )}
        <div className="grid2">
          <Button
            small
            busy={busy === 'save'}
            disabled={!changed}
            onClick={() => run('save', () => saveMapStyle(api, draft), t('Map style saved'))}
          >
            {t('Save map style')}
          </Button>
          <Button
            small
            variant="ghost"
            busy={busy === 'reset'}
            disabled={JSON.stringify(saved) === JSON.stringify(DEFAULT_MAP_STYLE) && !changed}
            onClick={() => run('reset', () => resetMapStyle(api), t('Map style reset'))}
          >
            {t('Reset to default')}
          </Button>
        </div>
      </div>
    </details>
  );
}
