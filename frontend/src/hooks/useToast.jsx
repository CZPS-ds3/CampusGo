import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/icons.jsx';

const ToastContext = createContext(null);
const LIFETIME_MS = 4500;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const push = useCallback((text, kind) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((list) => [...list.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), LIFETIME_MS);
  }, []);

  const api = useMemo(
    () => ({ info: (text) => push(text, 'info'), error: (text) => push(text, 'error') }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.kind}`}>
            <Icon name={toast.kind === 'error' ? 'warn' : 'check'} />
            <span>{toast.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast needs a ToastProvider');
  return value;
}
