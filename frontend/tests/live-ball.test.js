import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FOLLOW_ZOOM,
  accuracyRingPx,
  glide,
  metresPerPixel,
  puckHtml,
  rollBall,
} from '../src/map-pins.js';

// Made-up positions near the Bildungscampus; no real student location is used.
const HERE = [49.148, 9.216];

/** A drawn ball, and the middle of one facet that faces the viewer (its index and y in the drawing). */
function ball() {
  const element = document.createElement('div');
  element.innerHTML = puckHtml();
  const facets = [...element.querySelectorAll('.puck__facet')];
  const middle = (facet) => {
    const points = facet
      .getAttribute('points')
      .split(' ')
      .map((p) => p.split(',').map(Number));
    return [0, 1].map((i) => points.reduce((sum, p) => sum + p[i], 0) / points.length);
  };
  // The facet nearest the middle of the drawing, well away from the outline.
  const index = facets
    .map((facet, i) => ({ i, d: facet.getAttribute('points') ? Math.hypot(...middle(facet)) : 99 }))
    .sort((a, b) => a.d - b.d)[0].i;
  return { element, facets, middle: () => middle(facets[index]) };
}

describe('the live position on the map', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps the accuracy circle one size on screen: as it looks in the following view, capped for a coarse fix', () => {
    // A sixth of 12 m is 2 m; at zoom 19 x 2.2 one pixel is about 0.09 m here.
    expect(metresPerPixel(HERE[0], 19 + Math.log2(2.2))).toBeCloseTo(0.0883, 3);
    // Re-center on a larger screen is 1.2 times closer than that.
    expect(FOLLOW_ZOOM).toBeCloseTo(19 + Math.log2(2.2) + Math.log2(1.2), 6);
    expect(accuracyRingPx(12, HERE[0])).toBe(23);
    expect(accuracyRingPx(1, HERE[0])).toBe(20); // never smaller than the ball
    expect(accuracyRingPx(500, HERE[0])).toBe(80); // a laptop on Wi-Fi does not fill the screen
  });

  it('rolls the ball the way it moves: walking north turns its front up', () => {
    const { element, middle } = ball();
    const [, before] = middle();
    rollBall(element, 0, 3); // 3 pixels north
    const [, after] = middle();
    expect(after).toBeLessThan(before); // up in the drawing (y grows downwards)
  });

  it('does not turn the ball without a step', () => {
    const { element, facets } = ball();
    const before = facets.map((f) => f.getAttribute('points'));
    rollBall(element, 0, 0);
    expect(facets.map((f) => f.getAttribute('points'))).toEqual(before);
  });

  it('glides to a new reading instead of jumping, and ends exactly on it', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const draw = vi.fn();
    const to = [HERE[0] + 0.00001, HERE[1]]; // about 1.1 m north
    glide(HERE, to, draw);
    vi.advanceTimersByTime(300);
    const [midway] = draw.mock.calls.at(-1);
    expect(midway[0]).toBeGreaterThan(HERE[0]);
    expect(midway[0]).toBeLessThan(to[0]);
    vi.advanceTimersByTime(1000);
    expect(draw.mock.calls.at(-1)[0]).toEqual(to);
    // The steps on the ground add up to the whole walk north.
    const north = draw.mock.calls.reduce((sum, [, , metres]) => sum + metres, 0);
    expect(north).toBeCloseTo(1.11, 2);
  });

  it('jumps instead of sliding across the map after a long way', () => {
    const draw = vi.fn();
    glide(HERE, [HERE[0] + 0.01, HERE[1]], draw); // about 1.1 km
    expect(draw).toHaveBeenCalledWith([HERE[0] + 0.01, HERE[1]], 0, 0);
  });
});
