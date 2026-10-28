import { Component } from 'react';
import { t } from '../i18n.js';

/** Last line of defence: a rendering error shows a message and a reload button instead of a blank page. */
export class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="boundary" role="alert">
        <h1 className="display h1">{t('Something went wrong. Please try again.')}</h1>
        <p className="muted">{t('The app hit a problem. Reload the page to continue.')}</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          {t('Reload')}
        </button>
      </main>
    );
  }
}
