import { useLocation, useNavigate } from 'react-router-dom';
import { IconButton } from './icons.jsx';
import { t } from '../i18n.js';

/**
 * The X in the top right corner of every screen behind the login except the map and the running quiz. It always
 * sits in the same place and always returns to the map. (The quiz keeps its own header: leaving mid-attempt is
 * not offered there, just like the disabled back button.)
 */
export function PageClose() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (pathname === '/map' || pathname.startsWith('/quiz')) return null;
  return (
    <IconButton
      icon="close"
      label={t('Close and go to the map')}
      className="page-close"
      onClick={() => navigate('/map')}
    />
  );
}
