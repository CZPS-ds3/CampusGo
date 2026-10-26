import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatClock, useServerTimer } from '../src/hooks/useServerTimer.js';

describe('BR13 BR22 server timer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('formats whole seconds as m:ss', () => {
    expect(formatClock(300)).toBe('5:00');
    expect(formatClock(61)).toBe('1:01');
    expect(formatClock(0)).toBe('0:00');
  });

  it('starts from the server difference, never from zero (no flash of "expired")', () => {
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'));
    const { result } = renderHook(() =>
      useServerTimer('2026-11-02T12:03:00Z', '2026-11-02T12:00:00Z'),
    );
    expect(result.current.seconds).toBe(180);
  });

  it('counts down with the clock and stops at zero', () => {
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'));
    const { result } = renderHook(() =>
      useServerTimer('2026-11-02T12:00:10Z', '2026-11-02T12:00:00Z'),
    );
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.seconds).toBe(6);
    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current.seconds).toBe(0);
    expect(result.current.remainingMs).toBe(0);
  });

  it('corrects for a client clock that runs ahead of the server', () => {
    vi.setSystemTime(new Date('2026-11-02T12:10:00Z')); // client thinks it is 10 minutes later
    const { result } = renderHook(() =>
      useServerTimer('2026-11-02T12:01:00Z', '2026-11-02T12:00:00Z'),
    );
    act(() => vi.advanceTimersByTime(250));
    expect(result.current.seconds).toBe(60);
  });
});
