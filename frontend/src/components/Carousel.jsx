import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../i18n.js';
import { Icon } from './icons.jsx';

export const CAROUSEL_INTERVAL_MS = 5000;

/**
 * Photo carousel that moves on every 5 seconds. It pauses while the pointer or keyboard focus is
 * on it, while the tab is hidden and when the visitor asked for reduced motion.
 */
export function Carousel({ images, label, interval = CAROUSEL_INTERVAL_MS }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef(null);
  const count = images.length;
  const current = Math.min(index, Math.max(count - 1, 0));

  const go = useCallback(
    (step) => setIndex((i) => (((Math.min(i, count - 1) + step) % count) + count) % count),
    [count],
  );

  useEffect(() => {
    if (count < 2 || paused) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined;
    const id = setInterval(() => {
      if (!document.hidden) go(1);
    }, interval);
    return () => clearInterval(id);
  }, [count, paused, interval, go, current]);

  if (count === 0) return null;
  const image = images[current];

  return (
    <figure
      className="carousel"
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return;
        const delta = event.changedTouches[0].clientX - touchStart.current;
        touchStart.current = null;
        if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
      }}
    >
      <div className="carousel__stage" aria-live={paused ? 'polite' : 'off'}>
        {images.map((item, i) => (
          <img
            key={item.url}
            className={`carousel__img${i === current ? ' is-current' : ''}`}
            src={item.url}
            alt={i === current ? item.alt : ''}
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            draggable="false"
          />
        ))}
        {count > 1 && (
          <>
            <button
              type="button"
              className="carousel__nav carousel__nav--prev"
              aria-label={t('Previous photo')}
              onClick={() => go(-1)}
            >
              <Icon name="back" size={20} />
            </button>
            <button
              type="button"
              className="carousel__nav carousel__nav--next"
              aria-label={t('Next photo')}
              onClick={() => go(1)}
            >
              <Icon name="chevron" size={20} />
            </button>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="carousel__dots">
          {images.map((item, i) => (
            <button
              key={item.url}
              type="button"
              className={`carousel__dot${i === current ? ' is-current' : ''}`}
              aria-label={t('Photo {n} of {total}', { n: i + 1, total: count })}
              aria-current={i === current}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
      <figcaption className="carousel__credit caption muted">{image.credit}</figcaption>
    </figure>
  );
}
