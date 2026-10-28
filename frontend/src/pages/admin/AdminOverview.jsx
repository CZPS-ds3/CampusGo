import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { errorText } from '../../api/errorText.js';
import { Skeleton } from '../../components/Screen.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { formatNumber, t } from '../../i18n.js';

export default function AdminOverview() {
  const toast = useToast();
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    api.admin
      .overview()
      .then((result) => alive && setData(result))
      .catch((error) => alive && toast.error(errorText(error)));
    return () => {
      alive = false;
    };
  }, [toast]);

  if (!data) return <Skeleton rows={2} />;
  const tiles = [
    [t('Active players'), data.users.active],
    [t('Signed in now'), data.activeSessions],
    [t('Logins today'), data.loginsToday],
    [t('Quests passed today'), data.questsPassedToday],
    [t('Teams'), data.teams],
    [t('Blocked'), data.users.blocked],
    [t('Archived'), data.users.archived],
    [t('Deleted'), data.users.deleted],
  ];
  return (
    <section className="admin-tiles" aria-label={t('Overview')}>
      {tiles.map(([label, value]) => (
        <div key={label} className="card card--tight">
          <p className="caption muted">{label}</p>
          <p className="mono h2 accent">{formatNumber(value)}</p>
        </div>
      ))}
    </section>
  );
}
