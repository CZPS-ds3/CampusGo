import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal sheet with a real focus trap. The page behind is inert while it is open, Escape closes it
 * (unless `locked`), and focus returns to whatever opened it.
 */
export function Sheet({ title, onClose, locked, light, children, labelId = 'sheet-title' }) {
  const box = useRef(null);

  useEffect(() => {
    const root = document.getElementById('root');
    const opener = document.activeElement;
    root?.setAttribute('inert', '');
    const target = box.current?.querySelector('[data-autofocus]') ?? box.current;
    target?.focus();
    return () => {
      root?.removeAttribute('inert');
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  const onKeyDown = (event) => {
    if (event.key === 'Escape' && !locked) {
      event.preventDefault();
      onClose?.();
    }
    if (event.key === 'Tab') {
      const nodes = [...box.current.querySelectorAll(FOCUSABLE)];
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  return createPortal(
    <div className="sheet-scrim" onKeyDown={onKeyDown}>
      <div
        ref={box}
        className={`sheet${light ? ' sheet--light' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        tabIndex={-1}
      >
        <h2 id={labelId}>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
