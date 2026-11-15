// The live position is never older than 3 seconds while the map is open (the ball follows the visitor closely).
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASK_AHEAD_MS,
  REARM_GRACE_MS,
  REFRESH_MS,
  useLiveLocation,
} from '../src/hooks/useLiveLocation.js';

const reading = (north, time = Date.now()) => ({
  coords: {
    latitude: 49.1 + north / 111_250,
    longitude: 9.2,
    accuracy: 5,
    heading: null,
    speed: null,
  },
  timestamp: time,
});

let geo;
beforeEach(() => {
  vi.useFakeTimers();
  let id = 0;
  geo = {
    watchPosition: vi.fn(() => {
      id += 1;
      return id;
    }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  };
  vi.stubGlobal('navigator', { ...navigator, permissions: undefined, geolocation: geo });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
});

function started() {
  const hook = renderHook(() => useLiveLocation());
  act(() => hook.result.current.start());
  return hook;
}

/** The reading callback of the newest watch. */
const latestWatch = () => geo.watchPosition.mock.calls.at(-1);

describe('BR12 the live position is refreshed at least every 3 seconds', () => {
  it('BR12 the ball gets a reading at least every 3 seconds: the watch is restarted a second early', () => {
    expect(REFRESH_MS).toBe(3000);
    expect(ASK_AHEAD_MS).toBe(1000);
  });

  it('BR12 restarts the watch for a fresh, precise reading when it has been quiet for 2 seconds', () => {
    started();
    act(() => vi.advanceTimersByTime(1900));
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(400));
    expect(geo.clearWatch).toHaveBeenCalledWith(1);
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
    expect(latestWatch()[2]).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
  });

  it('BR12 never asks for a one-off reading (it cannot be cancelled and blocks simulated positions)', () => {
    started();
    act(() => vi.advanceTimersByTime(20_000));
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('BR12 the restarted watch moves the ball like any other reading', () => {
    const { result } = started();
    act(() => vi.advanceTimersByTime(2300));
    act(() => latestWatch()[0](reading(0)));
    expect(result.current.status).toBe('on');
    expect(result.current.position.lat).toBeCloseTo(49.1, 6);
    // The walking velocity goes to the map, so the ball can walk on between readings.
    expect(result.current.position.velocity).toEqual([0, 0]);
  });

  it('BR12 restarts nothing while the watch keeps reporting', () => {
    started();
    const onReading = geo.watchPosition.mock.calls[0][0];
    for (let i = 1; i <= 6; i += 1) {
      act(() => vi.advanceTimersByTime(1500));
      act(() => onReading(reading(i, Date.now())));
    }
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    expect(geo.clearWatch).not.toHaveBeenCalled();
  });

  it('BR12 a restarted watch that is still waiting gets its grace time before the next restart', () => {
    started();
    act(() => vi.advanceTimersByTime(2300));
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(REARM_GRACE_MS - 500));
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(800));
    expect(geo.watchPosition).toHaveBeenCalledTimes(3);
  });

  it('BR12 after an answer the next restart comes 2 seconds after it again', () => {
    started();
    act(() => vi.advanceTimersByTime(2300));
    act(() => latestWatch()[0](reading(1)));
    act(() => vi.advanceTimersByTime(1800));
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(400));
    expect(geo.watchPosition).toHaveBeenCalledTimes(3);
  });

  it('BR12 restarts nothing while the tab is hidden (no battery for an unseen map)', () => {
    started();
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => vi.advanceTimersByTime(10_000));
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
  });

  it('BR12 a refusal switches the live position off and stops the restarts', () => {
    const { result } = started();
    act(() => vi.advanceTimersByTime(2300));
    act(() => latestWatch()[1]({ code: 1 }));
    expect(result.current.status).toBe('denied');
    act(() => vi.advanceTimersByTime(10_000));
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
  });

  it('BR12 leaving the map stops the watch and the restarts', () => {
    const { unmount } = started();
    unmount();
    expect(geo.clearWatch).toHaveBeenCalledWith(1);
    act(() => vi.advanceTimersByTime(10_000));
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
  });
});
