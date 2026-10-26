import { Button } from '../components/Button.jsx';
import { Screen } from '../components/Screen.jsx';
import { copy } from '../i18n.js';

/** Could-have: the city expansion is only announced, nothing is playable yet. */
export default function CityTeaser() {
  return (
    <Screen title={copy.city.title}>
      <section className="panel stack">
        <p>{copy.city.body}</p>
        <div className="row">
          <Button variant="quiet" to="/profile">
            {copy.city.back}
          </Button>
        </div>
      </section>
    </Screen>
  );
}
