import { useEffect, useRef } from 'react';
import { t } from '../i18n.js';

/**
 * Page frame for the screens behind the login: a content column with room for the GO badge at the bottom.
 * Focus lands on the heading on arrival so a screen reader announces the new page.
 */
export function Page({ title, aside, wide, className = '', children }) {
  const heading = useRef(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <main className={`page${wide ? ' page--wide' : ''} ${className}`.trim()}>
      {title && (
        <header className="page__head">
          <h1 ref={heading} tabIndex={-1} className="display h1 page__title">
            {title}
          </h1>
          {aside && <div className="page__aside">{aside}</div>}
        </header>
      )}
      {children}
    </main>
  );
}

/** Skeleton rows while data loads. */
export function Skeleton({ rows = 3, height = 72 }) {
  return (
    <div className="stack" aria-busy="true" aria-label={t('Loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}
