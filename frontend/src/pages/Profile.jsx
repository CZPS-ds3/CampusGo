import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Avatar } from '../components/Avatar.jsx';
import { Button } from '../components/Button.jsx';
import { Icon } from '../components/icons.jsx';
import { Screen } from '../components/Screen.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { copy } from '../i18n.js';

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export default function Profile() {
  const navigate = useNavigate();
  const toast = useToast();
  const { student, refresh, logout } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    // The server checks again; this only saves a round trip.
    if (file.size > MAX_BYTES) {
      setError(copy.profile.pictureTooBig);
      return;
    }
    if (!TYPES.includes(file.type)) {
      setError(copy.profile.pictureBad);
      return;
    }
    setBusy(true);
    try {
      await api.uploadPicture(file);
      await refresh();
      toast.info(copy.profile.pictureSaved);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <Screen title={copy.profile.title}>
      <div className="twocol">
        <section className="panel stack" aria-label="Your details">
          <div className="row">
            <Avatar large name={student.displayName} url={student.pictureUrl} />
            <div>
              <p className="profile__name">
                {student.firstName} {student.lastName}
              </p>
              <p className="muted">{student.email}</p>
              <p className="muted">
                {copy.profile.visibleAs}: <strong>{student.displayName}</strong>
              </p>
            </div>
          </div>
          <input
            ref={fileInput}
            id="picture"
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={upload}
            tabIndex={-1}
          />
          <div className="row">
            <Button variant="quiet" busy={busy} onClick={() => fileInput.current?.click()}>
              <Icon name="camera" />
              {copy.profile.picture}
            </Button>
            <span className="field__hint">{copy.profile.pictureHint}</span>
          </div>
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
        </section>

        <section className="panel stack" aria-label="Settings">
          <h2>{copy.profile.location}</h2>
          <p>{student.locationConsent ? copy.profile.locationOn : copy.profile.locationOff}</p>
          <div className="row">
            <Button variant="quiet" to="/city">
              {copy.profile.city}
            </Button>
            <Button onClick={leave}>{copy.profile.logout}</Button>
          </div>
        </section>
      </div>
    </Screen>
  );
}
