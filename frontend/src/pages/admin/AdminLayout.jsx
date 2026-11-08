import { useEffect, useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Page } from '../../components/Screen.jsx';
import { t } from '../../i18n.js';

const TABS = [
  ['/admin', 'Dashboard', true],
  ['/admin/users', 'Users', false],
  ['/admin/teams', 'Teams', false],
  ['/admin/quests', 'Quests', false],
  ['/admin/names', 'Names', false],
  ['/admin/test-quests', 'Test quests', false],
];

/** Frame of the admin area: heading, a tab row that scrolls sideways on phones, and the chosen section. */
export default function AdminLayout() {
  const nav = useRef(null);

  // Keep the current tab in view on narrow screens.
  useEffect(() => {
    nav.current?.querySelector('.active')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  });

  return (
    <Page title={t('Admin')} wide className="page--admin">
      <nav ref={nav} className="admin-nav" aria-label={t('Admin sections')}>
        {TABS.map(([to, label, end]) => (
          <NavLink key={to} to={to} end={end} className="admin-nav__link">
            {t(label)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </Page>
  );
}
