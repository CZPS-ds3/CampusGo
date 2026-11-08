import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPosition } from '../src/hooks/useGeolocation.js';

/** A fake browser Geolocation: `script` decides what each watch reports and when. */
function fakeGeolocation(script) {
  const watches = [];
  const geolocation = {
    watchPosition: vi.fn((onPosition, onError, options) => {
      const id = watches.length + 1;
      watches.push({ id, options });
      script({ onPosition, onError, options, call: watches.length });
      return id;
    }),
    clearWatch: vi.fn(),
  };
  Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true });
  return { geolocation, watches };
}

const reading = (accuracy, timestamp = Date.now()) => ({
  coords: { latitude: 49.1, longitude: 9.2, accuracy },
  timestamp,
});
const failure = (code) => ({ code });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  delete navigator.geolocation;
});

describe('BR12 getting a position that is easy to pass', () => {
  it('a good reading is used at once, without waiting for the whole window', async () => {
    const { geolocation } = fakeGeolocation(({ onPosition }) => onPosition(reading(12)));
    await expect(getPosition()).resolves.toMatchObject({ accuracy: 12, latitude: 49.1 });
    expect(geolocation.clearWatch).toHaveBeenCalled();
  });

  it('a coarse reading is kept while waiting, and the most precise one wins', async () => {
    fakeGeolocation(({ onPosition }) => {
      onPosition(reading(150));
      setTimeout(() => onPosition(reading(60)), 1000);
      setTimeout(() => onPosition(reading(90)), 2000);
    });
    const result = getPosition();
    await vi.advanceTimersByTimeAsync(9000);
    await expect(result).resolves.toMatchObject({ accuracy: 60 });
  });

  it('the age of a reading is worked out when it is sent, not when it was taken', async () => {
    const taken = Date.now();
    fakeGeolocation(({ onPosition }) => onPosition(reading(80, taken)));
    const result = getPosition();
    await vi.advanceTimersByTimeAsync(9000);
    const sample = await result;
    expect(sample.ageMs).toBeGreaterThanOrEqual(8000);
  });

  it('when the GPS finds nothing, the network position is tried next', async () => {
    const { watches } = fakeGeolocation(({ onPosition, onError, options }) => {
      if (options.enableHighAccuracy) onError(failure(3));
      else onPosition(reading(120));
    });
    const result = getPosition();
    await vi.advanceTimersByTimeAsync(16_000);
    await expect(result).resolves.toMatchObject({ accuracy: 120 });
    expect(watches.map((w) => w.options.enableHighAccuracy)).toEqual([true, false]);
  });

  it('a refusal ends at once and is reported as denied, with no second try', async () => {
    const { watches } = fakeGeolocation(({ onError }) => onError(failure(1)));
    await expect(getPosition()).rejects.toBe('denied');
    expect(watches).toHaveLength(1);
  });

  it('no reading at all after both tries is a timeout', async () => {
    fakeGeolocation(() => {});
    const result = getPosition().catch((reason) => reason);
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(result).resolves.toBe('timeout');
  });

  it('a browser without geolocation is reported as unavailable', async () => {
    await expect(getPosition()).rejects.toBe('unavailable');
  });

  it('a pretend position (development only) is returned as it is', async () => {
    await expect(getPosition({ latitude: 1, longitude: 2, accuracy: 3 })).resolves.toEqual({
      ageMs: 0,
      latitude: 1,
      longitude: 2,
      accuracy: 3,
    });
  });
});
