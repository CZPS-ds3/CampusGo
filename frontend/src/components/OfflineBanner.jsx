import { useEffect, useState } from 'react';
import { copy } from '../i18n.js';
import { Icon } from './icons.jsx';

/** Shows a banner while the browser reports that it is offline. */
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

export function OfflineBanner({ message = copy.errors.offline }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="banner" role="status">
      <Icon name="wifiOff" />
      {message}
    </div>
  );
}
