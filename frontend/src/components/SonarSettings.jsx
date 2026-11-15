import { useId, useState } from 'react';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { t } from '../i18n.js';
import { saveMapStyle, showMapStyle, useMapStyle } from '../mapStyle.js';
import { Icon } from './icons.jsx';

const SPEEDS = [
  ['slow', 'Slow'],
  ['normal', 'Normal'],
  ['fast', 'Fast'],
];
const LOOKS = [
  ['soft', 'Soft pulse'],
  ['sova', 'Scan line'],
];

/** One labelled on/off switch. */
function Switch({ id, label, checked, disabled, onChange }) {
  return (
    <div className="row row--between sonarpref__switch">
      <span id={id} className="small strong">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={checked}
        aria-labelledby={id}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

/** A segmented choice of the sonar (speed or look). */
function Choice({ label, options, value, disabled, onChange }) {
  return (
    <div>
      <p className="caption">{label}</p>
      <div className={`seg seg--${options.length} mt-s`} role="radiogroup" aria-label={label}>
        {options.map(([id, name]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            disabled={disabled}
            onClick={() => onChange(id)}
          >
            {t(name)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The sonar range ring in the preferences (BR48): on/off, the flash for quests in range, pulse speed and look. Like
 * the other preferences a change applies at once; it is saved on the account with the map style, whose colour of
 * the ring stays in Customisation. If saving fails, the ring goes back to how it was.
 */
export function SonarSettings() {
  const id = useId();
  const style = useMapStyle();
  const [error, setError] = useState('');
  const { sonar } = style;

  const change = async (patch) => {
    const before = style;
    const next = { ...style, sonar: { ...sonar, ...patch } };
    setError('');
    showMapStyle(next);
    try {
      await saveMapStyle(api, next);
    } catch (failure) {
      showMapStyle(before);
      setError(errorText(failure));
    }
  };

  return (
    <div className="stack sonarpref" data-testid="sonar-settings">
      <div>
        <p className="strong">{t('Sonar range ring')}</p>
        <p className="small muted">
          {t('Waves run from your ball out to how far away you can unlock a quest.')}
        </p>
      </div>
      <Switch
        id={`${id}-show`}
        label={t('Show the sonar')}
        checked={sonar.show}
        onChange={(show) => change({ show })}
      />
      <Switch
        id={`${id}-ping`}
        label={t('Flash quests in range')}
        checked={sonar.show && sonar.ping}
        disabled={!sonar.show}
        onChange={(ping) => change({ ping })}
      />
      <Choice
        label={t('Pulse speed')}
        options={SPEEDS}
        value={sonar.speed}
        disabled={!sonar.show}
        onChange={(speed) => change({ speed })}
      />
      <Choice
        label={t('Look')}
        options={LOOKS}
        value={sonar.look}
        disabled={!sonar.show}
        onChange={(look) => change({ look })}
      />
      {error && (
        <p className="field-note field-note--error" role="alert">
          <Icon name="warn" size={18} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
