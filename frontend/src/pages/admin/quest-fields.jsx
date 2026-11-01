import { useId } from 'react';
import { Icon } from '../../components/icons.jsx';

/** A labelled select in the look of the other form fields. */
export function Select({ label, hint, children, ...rest }) {
  const id = useId();
  return (
    <div className="field-wrap">
      <label htmlFor={id} className="caption field-label">
        {label}
      </label>
      <select
        id={id}
        className="field"
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...rest}
      >
        {children}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="field-note">
          <span>{hint}</span>
        </p>
      )}
    </div>
  );
}

/** A labelled multi-line text field. */
export function Textarea({ label, hint, error, ...rest }) {
  const id = useId();
  return (
    <div className="field-wrap">
      <label htmlFor={id} className="caption field-label">
        {label}
      </label>
      <textarea
        id={id}
        className={`field field--area${error ? ' field-error' : ''}`}
        rows={3}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        {...rest}
      />
      {(error || hint) && (
        <p id={`${id}-note`} role={error ? 'alert' : undefined} className="field-note">
          {error && <Icon name="warn" size={18} />}
          <span>{error || hint}</span>
        </p>
      )}
    </div>
  );
}

/** A checkbox with its label, big enough to tap. */
export function Check({ label, hint, ...rest }) {
  const id = useId();
  return (
    <div className="check">
      <input id={id} type="checkbox" {...rest} />
      <label htmlFor={id}>
        {label}
        {hint && <span className="small muted block">{hint}</span>}
      </label>
    </div>
  );
}
