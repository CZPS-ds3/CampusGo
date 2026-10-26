import { Button } from '../components/Button.jsx';
import { copy } from '../i18n.js';
import { useSession } from '../hooks/useSession.jsx';

/** Authored radar rings: concentric circles around a single dot, with a dashed trail. No imagery needed. */
function Radar() {
  return (
    <svg className="radar" viewBox="0 0 320 320" aria-hidden="true" focusable="false">
      <circle cx="160" cy="160" r="150" className="radar__ring" />
      <circle cx="160" cy="160" r="110" className="radar__ring" />
      <circle cx="160" cy="160" r="70" className="radar__ring" />
      <path d="M40 250 C 100 210, 130 230, 160 160 S 230 90, 280 60" className="radar__trail" />
      <circle cx="40" cy="250" r="9" className="radar__stone" />
      <circle cx="128" cy="222" r="9" className="radar__stone" />
      <circle cx="232" cy="106" r="9" className="radar__stone" />
      <circle cx="280" cy="60" r="9" className="radar__stone" />
      <circle cx="160" cy="160" r="16" className="radar__dot" />
    </svg>
  );
}

export default function Splash() {
  const { student, ready } = useSession();
  const signedIn = ready && student;
  return (
    <main className="splash">
      <div className="splash__text">
        <h1 className="display splash__title">{copy.splash.title}</h1>
        <p className="splash__lead">{copy.splash.lead}</p>
        <Button to={signedIn ? '/map' : '/login'}>
          {signedIn ? copy.splash.resume : copy.splash.start}
        </Button>
      </div>
      <Radar />
    </main>
  );
}
