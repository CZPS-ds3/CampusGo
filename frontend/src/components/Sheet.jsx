import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './icons.jsx';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared focus handling for dialogs: page behind is inert, Tab stays inside, Escape closes, focus returns. */
function useDialog(box, onClose, locked) {
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
  }, [box]);

  return (event) => {
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
}

/** Bottom sheet (a centred card on tablets and laptops). `locked` means only an explicit choice closes it. */
export function Sheet({ title, onClose, locked, children }) {
  const box = useRef(null);
  const onKeyDown = useDialog(box, onClose, locked);
  return createPortal(
    <div className="sheet-root" onKeyDown={onKeyDown}>
      <div className="scrim" onClick={locked ? undefined : onClose} aria-hidden="true" />
      <div
        ref={box}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="sheet__grip" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** A centred dialog with a title and an X that closes it. Escape and a tap beside it close it too. */
export function Dialog({ title, onClose, closeLabel, className = '', children }) {
  const box = useRef(null);
  const onKeyDown = useDialog(box, onClose, false);
  return createPortal(
    <div className="dialog-root" onKeyDown={onKeyDown}>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={box}
        className={`card dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="dialog__head">
          <h2 className="h3 display dialog__title">{title}</h2>
          <IconButton icon="close" label={closeLabel} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Centred confirmation card. */
export function Modal({ title, onClose, children }) {
  const box = useRef(null);
  const onKeyDown = useDialog(box, onClose, false);
  return createPortal(
    <div className="modal-root" onKeyDown={onKeyDown}>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={box}
        className="card modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
