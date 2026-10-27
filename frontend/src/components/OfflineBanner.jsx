import { useEffect, useState } from 'react';
import { t } from '../i18n.js';
import { Icon } from './icons.jsx';

/** True while the browser reports a connection. */
export function useOnline() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** Shows a banner while the browser is offline. */
export function OfflineBanner({ message }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="banner" role="status">
      <Icon name="wifiOff" />
      {message ?? t('You are offline.')}
    </div>
  );
}
