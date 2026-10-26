import { Button } from '../components/Button.jsx';
import { copy } from '../i18n.js';

export default function NotFound() {
  return (
    <main className="boundary">
      <h1 className="display">{copy.errors.notFoundTitle}</h1>
      <p>{copy.errors.notFoundBody}</p>
      <Button to="/">{copy.errors.home}</Button>
    </main>
  );
}
