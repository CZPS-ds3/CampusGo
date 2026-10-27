import { forwardRef, useId } from 'react';
import { setSettings, t, useSettings } from '../i18n.js';
import { Icon } from './icons.jsx';

/** Heading in the display voice. `size` picks the type step (h1, h2, h3). */
export const Display = forwardRef(function Display(
  { as: Tag = 'h2', size = 'h2', className = '', children, ...rest },
  ref,
) {
  return (
    <Tag ref={ref} className={`display ${size} ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
});

/** Small status pill. Tones: red, sub, ok, warn, accent, mute (default is a grey pill). */
export function Chip({ tone, icon, children }) {
  return (
    <span className={`chip${tone ? ` chip--${tone}` : ''}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

/** Labelled text field with a hint or an error line. Extra props go to the input. */
export function Input({ label, error, hint, className = '', ...rest }) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className={`field-wrap ${className}`.trim()}>
      <label htmlFor={id} className="caption field-label">
        {label}
      </label>
      <input
        id={id}
        {...rest}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error || hint ? noteId : undefined}
        className={`field${error ? ' field-error' : ''}`}
      />
      {(error || hint) && (
        <p
          id={noteId}
          role={error ? 'alert' : undefined}
          className={`field-note${error ? ' field-note--error' : ''}`}
        >
          {error && <Icon name="warn" size={18} />}
          <span>{error || hint}</span>
        </p>
      )}
    </div>
  );
}

export function Logo({ height = 56, className = '' }) {
  return (
    <span className={`logo-wrap ${className}`.trim()}>
      <img src="/dhbw-logo.png" alt="DHBW Duale Hochschule Baden-Württemberg" style={{ height }} />
    </span>
  );
}

export function EmptyState({ icon, title, body, action }) {
  return (
    <div className="card empty">
      <span className="empty__icon">
        <Icon name={icon} size={28} />
      </span>
      <Display size="h3">{title}</Display>
      <p>{body}</p>
      {action}
    </div>
  );
}

/** Two-way language switch for screens before sign-in. */
export function LangSwitch() {
  const { lang } = useSettings();
  return (
    <div className="seg seg--2 langswitch" role="radiogroup" aria-label={t('Language')}>
      {[
        ['de', 'DE', 'Deutsch'],
        ['en', 'EN', 'English'],
      ].map(([id, short, name]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={lang === id}
          aria-label={name}
          onClick={() => setSettings({ lang: id })}
        >
          {short}
        </button>
      ))}
    </div>
  );
}
