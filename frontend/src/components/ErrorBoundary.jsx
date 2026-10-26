import { Component } from 'react';
import { copy } from '../i18n.js';

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
        <h1 className="display">{copy.errors.generic}</h1>
        <p>{copy.errors.boundary}</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          {copy.errors.reload}
        </button>
      </main>
    );
  }
}
