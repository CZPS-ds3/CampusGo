import { forwardRef } from 'react';
import { Link } from 'react-router-dom';

/** Button or link that looks like one. `busy` keeps the label and shows a spinner. */
export const Button = forwardRef(function Button(
  { variant, block, small, busy, to, children, className = '', ...rest },
  ref,
) {
  const classes = [
    'btn',
    variant && `btn--${variant}`,
    block && 'btn--block',
    small && 'btn--small',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  if (to) {
    return (
      <Link ref={ref} to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      aria-busy={busy || undefined}
      {...rest}
      disabled={rest.disabled || busy}
    >
      {busy && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
});
