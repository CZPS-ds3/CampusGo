import { NavLink, Outlet } from 'react-router-dom';
import { Page } from '../../components/Screen.jsx';
import { t } from '../../i18n.js';

const TABS = [
  ['/admin', 'Overview', true],
  ['/admin/users', 'Users', false],
  ['/admin/teams', 'Teams', false],
  ['/admin/names', 'Names', false],
];

/** Frame of the admin area: heading, section links and the page of the chosen section. */
export default function AdminLayout() {
  return (
    <Page title={t('Admin')} wide className="page--admin">
      <nav className="admin-nav" aria-label={t('Admin sections')}>
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
