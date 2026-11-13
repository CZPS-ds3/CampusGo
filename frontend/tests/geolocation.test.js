import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { combineReadings, getPosition, useGeolocation } from '../src/hooks/useGeolocation.js';

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

const reading = (accuracy, timestamp = Date.now(), northM = 0) => ({
  coords: { latitude: 49.1 + northM / 111_250, longitude: 9.2, accuracy },
  timestamp,
});
const northOf = (sample) => (sample.latitude - 49.1) * 111_250;
const failure = (code) => ({ code });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  delete navigator.geolocation;
});

describe('BR12 getting a position that is easy to pass', () => {
  it('an excellent reading is used at once, without waiting for the whole window', async () => {
    const { geolocation } = fakeGeolocation(({ onPosition }) => onPosition(reading(4)));
    await expect(getPosition()).resolves.toMatchObject({ accuracy: 4, latitude: 49.1 });
    expect(geolocation.clearWatch).toHaveBeenCalled();
  });

  it('a good reading waits only a moment for more, not for the whole window', async () => {
    fakeGeolocation(({ onPosition }) => onPosition(reading(12)));
    const result = getPosition();
    await vi.advanceTimersByTimeAsync(2600);
    await expect(result).resolves.toMatchObject({ accuracy: 12, latitude: 49.1 });
  });

  it('a coarse reading is kept while waiting, and the most precise one wins', async () => {
    fakeGeolocation(({ onPosition }) => {
      onPosition(reading(150));
      setTimeout(() => onPosition(reading(60)), 1000);
      setTimeout(() => onPosition(reading(90)), 2000);
    });
    const result = getPosition();
    await vi.advanceTimersByTimeAsync(11_000);
    await expect(result).resolves.toMatchObject({ accuracy: 60 });
  });

  it('the age of a reading is worked out when it is sent, not when it was taken', async () => {
    const taken = Date.now();
    fakeGeolocation(({ onPosition }) => onPosition(reading(80, taken)));
    const result = getPosition();
    await vi.advanceTimersByTimeAsync(11_000);
    const sample = await result;
    expect(sample.ageMs).toBeGreaterThanOrEqual(8000);
  });

  it('when the GPS finds nothing, the network position is tried next', async () => {
    const { watches } = fakeGeolocation(({ onPosition, onError, options }) => {
      if (options.enableHighAccuracy) onError(failure(3));
      else onPosition(reading(120));
    });
    const result = getPosition();
    await vi.advanceTimersByTimeAsync(17_000);
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

describe('BR12 a precise position from several readings', () => {
  it('BR12 averages the jitter of good readings instead of taking one of them', async () => {
    fakeGeolocation(({ onPosition }) => {
      [6, -6, 5, -5, 6].forEach((north, i) =>
        setTimeout(() => onPosition(reading(10, Date.now(), north)), i * 300),
      );
    });
    const result = getPosition();
    await vi.advanceTimersByTimeAsync(2000);
    const sample = await result;
    expect(Math.abs(northOf(sample))).toBeLessThan(2); // every single reading is 5 to 6 m off
    expect(sample.accuracy).toBe(10); // never claims more than the best single reading
  });

  it('BR12 weighs each reading by its accuracy', () => {
    const sample = combineReadings(
      [
        { latitude: 49.1, longitude: 9.2, accuracy: 4, takenAt: 0 },
        { latitude: 49.1 + 8 / 111_250, longitude: 9.2, accuracy: 16, takenAt: 0 },
      ],
      0,
      0,
    );
    expect(northOf(sample)).toBeLessThan(1); // 16 m counts 16 times less than 4 m
    expect(sample.accuracy).toBe(4);
  });

  it('BR12 leaves out a reading far off the others', () => {
    const sample = combineReadings(
      [
        { latitude: 49.1, longitude: 9.2, accuracy: 8, takenAt: 0 },
        { latitude: 49.1 + 1 / 111_250, longitude: 9.2, accuracy: 9, takenAt: 0 },
        { latitude: 49.1 + 90 / 111_250, longitude: 9.2, accuracy: 10, takenAt: 0 },
      ],
      0,
      0,
    );
    expect(northOf(sample)).toBeLessThan(1);
  });

  it('BR12 leaves out a reading the browser kept from before the check, while fresh ones exist', () => {
    const sample = combineReadings(
      [
        { latitude: 49.1 + 300 / 111_250, longitude: 9.2, accuracy: 3, takenAt: -60_000 },
        { latitude: 49.1, longitude: 9.2, accuracy: 12, takenAt: 100 },
      ],
      0,
      200,
    );
    expect(sample).toMatchObject({ accuracy: 12, ageMs: 100 });
    expect(northOf(sample)).toBeCloseTo(0, 5);
  });

  it('BR12 sends the age of the oldest reading used, so the server judges freshness fairly', () => {
    const sample = combineReadings(
      [
        { latitude: 49.1, longitude: 9.2, accuracy: 10, takenAt: 1000 },
        { latitude: 49.1, longitude: 9.2, accuracy: 10, takenAt: 3000 },
      ],
      1000,
      4000,
    );
    expect(sample.ageMs).toBe(3000);
  });

  it('BR12 an exact (simulated) reading decides alone', () => {
    const sample = combineReadings(
      [
        { latitude: 49.1, longitude: 9.2, accuracy: 0, takenAt: 0 },
        { latitude: 49.1 + 3 / 111_250, longitude: 9.2, accuracy: 5, takenAt: 0 },
      ],
      0,
      0,
    );
    expect(sample).toMatchObject({ latitude: 49.1, accuracy: 0 });
  });

  it('BR12 five good readings end the wait early', async () => {
    fakeGeolocation(({ onPosition }) => {
      for (let i = 0; i < 5; i += 1) setTimeout(() => onPosition(reading(15)), i * 100);
    });
    const result = getPosition();
    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toMatchObject({ accuracy: 15 });
  });

  it('BR12 the screen hears the accuracy getting better while it waits', async () => {
    fakeGeolocation(({ onPosition }) => {
      onPosition(reading(80));
      setTimeout(() => onPosition(reading(35.4)), 500);
      setTimeout(() => onPosition(reading(4)), 1000);
    });
    const { result } = renderHook(() => useGeolocation());
    let done;
    act(() => {
      done = result.current.locate();
    });
    expect(result.current.accuracy).toBe(80);
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(result.current.accuracy).toBe(35);
    await act(() => vi.advanceTimersByTimeAsync(500));
    await expect(done).resolves.toMatchObject({ sample: { accuracy: 4 } });
    expect(result.current.accuracy).toBe(4);
  });
});
