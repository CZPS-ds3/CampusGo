import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { personIsHere, useAutoRefresh } from '../src/hooks/useAutoRefresh.js';

beforeEach(() => {
  vi.useFakeTimers();
  // A tap just happened, so the person counts as present.
  window.dispatchEvent(new Event('pointerdown'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BR03 screens follow changes made elsewhere without keeping an idle session alive', () => {
  it('refreshes on the interval while the person is looking and active', () => {
    const refresh = vi.fn();
    renderHook(() => useAutoRefresh(refresh, 10_000));
    vi.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('stops when the tab is hidden, and when the person has not touched the page for 5 minutes', () => {
    const refresh = vi.fn();
    renderHook(() => useAutoRefresh(refresh, 10_000));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    vi.advanceTimersByTime(30_000);
    expect(refresh).not.toHaveBeenCalled();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.advanceTimersByTime(6 * 60 * 1000);
    // Visible again, but nobody did anything for more than 5 minutes: still quiet.
    refresh.mockClear();
    vi.advanceTimersByTime(30_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(personIsHere()).toBe(false);
    window.dispatchEvent(new Event('keydown'));
    expect(personIsHere()).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalled();
  });

  it('refreshes at once when the person comes back to the tab, and stops after unmount', () => {
    const refresh = vi.fn();
    const { unmount } = renderHook(() => useAutoRefresh(refresh, 60_000));
    window.dispatchEvent(new Event('focus'));
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(120_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does nothing when switched off, for example while nobody is logged in', () => {
    const refresh = vi.fn();
    renderHook(() => useAutoRefresh(refresh, 10_000, false));
    vi.advanceTimersByTime(60_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('always calls the newest version of the callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => useAutoRefresh(fn, 10_000), {
      initialProps: { fn: first },
    });
    rerender({ fn: second });
    vi.advanceTimersByTime(10_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
