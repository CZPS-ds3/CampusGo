import { useEffect, useRef } from 'react';
import { Button } from '../components/Button.jsx';
import { Display } from '../components/ui.jsx';
import { t } from '../i18n.js';

export default function NotFound() {
  const heading = useRef(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <main className="notfound">
      <div className="halftone notfound__dots" aria-hidden="true" />
      <div className="notfound__inner">
        <p className="mono notfound__code" aria-hidden="true">
          404
        </p>
        <Display as="h1" size="h1" ref={heading} tabIndex={-1} className="block">
          {t('Out of bounds')}
        </Display>
        <p className="muted notfound__text">
          {t('This spot is not on the campus map. Head back to the field.')}
        </p>
        <Button to="/map">{t('Back to map')}</Button>
      </div>
    </main>
  );
}
