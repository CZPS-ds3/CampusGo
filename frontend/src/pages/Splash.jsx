import { Button } from '../components/Button.jsx';
import { Icon } from '../components/icons.jsx';
import { LangSwitch, Logo } from '../components/ui.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { t } from '../i18n.js';

export default function Splash() {
  const { student, ready } = useSession();
  const signedIn = ready && student;
  return (
    <main className="splash">
      <div className="halftone splash__dots" aria-hidden="true" />
      <div className="splash__lang">
        <LangSwitch />
      </div>
      <div className="splash__center">
        <div className="anim-pop">
          <Logo height={96} />
        </div>
        <h1 className="splash__title anim-fade" style={{ animationDelay: '300ms' }}>
          <span className="display splash__line1">Campus</span>
          <span className="display splash__line2">&amp; City Quest</span>
        </h1>
        <span className="splash__bar" aria-hidden="true" />
        <p className="caption muted">{t('DHBW Heilbronn · Orientation game')}</p>
      </div>
      <div className="splash__cta">
        <Button to={signedIn ? '/map' : '/login'} className="anim-pop">
          {signedIn ? t('Back to map') : t('Start')} <Icon name="arrow" />
        </Button>
      </div>
    </main>
  );
}
