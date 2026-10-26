import { useEffect, useRef } from 'react';
import { useSession } from '../hooks/useSession.jsx';

/** Page frame: skewed title, optional points chip, content column. Focus lands on the title on arrival. */
export function Screen({ title, aside, children, wide }) {
  const heading = useRef(null);
  const { student } = useSession();

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="page screen">
      <header className="screen__head">
        <h1 ref={heading} tabIndex={-1} className="display screen__title">
          {title}
        </h1>
        {aside ??
          (student && (
            <span className="chip chip--volt">{student.totalPoints.toLocaleString('en')} PTS</span>
          ))}
      </header>
      <main className={`screen__body${wide ? ' screen__body--wide' : ''}`}>{children}</main>
    </div>
  );
}

/** Skeleton rows while data loads. */
export function Skeleton({ rows = 3, height = 72 }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}
