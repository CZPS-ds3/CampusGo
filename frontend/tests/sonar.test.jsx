// The sonar range ring under the ball: its size, the quests in range, the flash once per entry (BR12) and its
// settings in the map style (BR48).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapStyleSettings } from '../src/components/MapStyleSettings.jsx';
import { ToastProvider } from '../src/hooks/useToast.jsx';
import {
  SONAR_WAVE_MS,
  createRangeWatch,
  groundHtml,
  inRange,
  metresPerPixel,
  pingDelayMs,
  pingPin,
  reachPx,
  ringReachM,
} from '../src/map-pins.js';
import {
  DEFAULT_MAP_STYLE,
  PRESETS,
  cleanStyle,
  sonarData,
  styleVariables,
} from '../src/mapStyle.js';

const api = vi.hoisted(() => ({
  saveMapStyle: vi.fn(async (style) => ({ style })),
  resetMapStyle: vi.fn(),
}));
vi.mock('../src/api/client.js', () => ({ api }));
beforeEach(() => api.saveMapStyle.mockClear());

const HERE = { lat: 49.148, lng: 9.216 };
const north = (metres) => HERE.lat + metres / 111_320;
const quest = (id, metres, over = {}) => ({
  id,
  name: `Q${id}`,
  latitude: north(metres),
  longitude: HERE.lng,
  radius: 60,
  reachM: 90,
  isActive: true,
  completed: false,
  ...over,
});

describe('BR12 the sonar range ring shows the real unlock range', () => {
  it('BR12 the ring reaches as far as the closest-reaching open quest, so everything inside can be unlocked', () => {
    expect(ringReachM([quest(1, 0, { reachM: 110 }), quest(2, 0, { reachM: 90 })])).toBe(90);
    // A closed quest does not count; a cleared one only when every open quest is cleared.
    expect(ringReachM([quest(1, 0, { reachM: 80, isActive: false }), quest(2, 0)])).toBe(90);
    expect(ringReachM([quest(1, 0, { reachM: 80, completed: true }), quest(2, 0)])).toBe(90);
    expect(ringReachM([quest(1, 0, { reachM: 80, completed: true })])).toBe(80);
    expect(ringReachM([])).toBeNull();
    // An older server without reachM: the radius alone.
    expect(ringReachM([{ ...quest(1, 0), reachM: undefined }])).toBe(60);
  });

  it('BR12 the ring is drawn to scale: metres on the ground turned into pixels at the zoom', () => {
    const zoom = 18;
    expect(reachPx(90, HERE.lat, zoom)).toBe(Math.round(90 / metresPerPixel(HERE.lat, zoom)));
    // One zoom level closer doubles it.
    expect(reachPx(90, HERE.lat, 19)).toBeCloseTo(2 * reachPx(90, HERE.lat, 18), -1);
    // Very close in, it is capped (the edge is off-screen anyway).
    expect(reachPx(90, HERE.lat, 21, 1000)).toBe(1000);
    expect(reachPx(null, HERE.lat, 18)).toBe(0);
  });

  it('BR12 a quest is in range within its own reach (radius + grace), not beyond', () => {
    expect(inRange(HERE, quest(1, 89))).toBe(true);
    expect(inRange(HERE, quest(1, 91))).toBe(false);
    expect(inRange(HERE, quest(1, 100, { reachM: 110 }))).toBe(true);
  });

  it('BR12 a quest flashes once when it comes into range, not again while it stays, and again after leaving', () => {
    const watch = createRangeWatch();
    const quests = [quest(1, 50), quest(2, 300)];
    expect(watch.update(HERE, quests).map((e) => e.id)).toEqual([1]);
    expect(watch.update(HERE, quests)).toEqual([]);
    expect(watch.update({ ...HERE, lat: north(300) }, quests).map((e) => e.id)).toEqual([2]);
    expect(watch.update(HERE, quests).map((e) => e.id)).toEqual([1]);
  });

  it('BR12 a quest whose pin is not drawn yet flashes once its pin appears, not never', () => {
    const watch = createRangeWatch();
    const quests = [quest(1, 20)];
    expect(watch.update(HERE, quests, () => false)).toEqual([]);
    expect(watch.update(HERE, quests, () => true).map((e) => e.id)).toEqual([1]);
    expect(watch.update(HERE, quests, () => true)).toEqual([]);
  });

  it('BR12 a closed quest never flashes, and the distance comes with each entry', () => {
    const watch = createRangeWatch();
    const [entry] = watch.update(HERE, [quest(1, 40), quest(2, 10, { isActive: false })]);
    expect(entry.id).toBe(1);
    expect(entry.metres).toBeCloseTo(40, 0);
  });

  it('BR12 the flash waits until the wave reaches the quest', () => {
    expect(pingDelayMs(0, 90, 'normal')).toBe(0);
    expect(pingDelayMs(45, 90, 'normal')).toBe(SONAR_WAVE_MS.normal / 2);
    expect(pingDelayMs(200, 90, 'fast')).toBe(SONAR_WAVE_MS.fast);
    expect(pingDelayMs(45, 90, 'unknown')).toBe(SONAR_WAVE_MS.normal / 2);
  });

  it('BR12 a pin flash sets its delay and ends by itself', () => {
    const box = document.createElement('div');
    box.innerHTML = '<span class="pin"><span class="pin__shape"></span></span>';
    pingPin(box, 750);
    const pin = box.querySelector('.pin');
    expect(pin.classList.contains('pin--ping')).toBe(true);
    expect(pin.style.getPropertyValue('--ping-delay')).toBe('750ms');
    pin.dispatchEvent(new Event('animationend'));
    expect(pin.classList.contains('pin--ping')).toBe(false);
    expect(() => pingPin(null, 0)).not.toThrow();
  });

  it('BR12 the ground under the ball carries the sonar with three waves and the range edge', () => {
    const box = document.createElement('div');
    box.innerHTML = groundHtml(null, 30);
    expect(box.querySelectorAll('.puck-sonar .puck-sonar__wave')).toHaveLength(3);
    expect(box.querySelector('.puck-sonar__edge')).not.toBeNull();
  });
});

describe('BR48 the sonar settings in the map style', () => {
  it('BR48 a stored style without sonar settings, or with broken ones, gets the defaults', () => {
    expect(cleanStyle({}).sonar).toEqual(DEFAULT_MAP_STYLE.sonar);
    expect(
      cleanStyle({ sonar: { show: 'no', color: 'url(x)', speed: 'warp', look: 'x', ping: 1 } })
        .sonar,
    ).toEqual(DEFAULT_MAP_STYLE.sonar);
    expect(cleanStyle({ sonar: { show: false, speed: 'slow', look: 'soft' } }).sonar).toMatchObject(
      { show: false, speed: 'slow', look: 'soft', ping: true },
    );
  });

  it('BR48 the settings reach the page as data attributes and a colour variable', () => {
    expect(sonarData(DEFAULT_MAP_STYLE)).toEqual({
      sonar: 'on',
      sonarLook: 'sova',
      sonarSpeed: 'normal',
      sonarPing: 'on',
    });
    const off = cleanStyle({ sonar: { show: false } });
    // No sonar, no flash.
    expect(sonarData(off)).toMatchObject({ sonar: 'off', sonarPing: 'off' });
    expect(styleVariables(DEFAULT_MAP_STYLE)['--sonar']).toBeUndefined();
    expect(styleVariables(cleanStyle({ sonar: { color: '#00ff00' } }))['--sonar']).toBe('#00ff00');
  });

  it('BR48 every preset has a sonar in its own line colour', () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      expect(cleanStyle(preset).sonar, name).toEqual(preset.sonar);
      expect(preset.sonar.color, name).toBe(preset.ball.lines);
    }
  });

  it('BR48 the student turns the flash off, picks speed, look and colour, sees the preview and saves', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MapStyleSettings />
      </ToastProvider>,
    );
    await user.click(screen.getByText('Map style'));
    const preview = screen.getByRole('img', { name: 'Preview of your map style' });
    expect(screen.getByTestId('preview-sonar')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Flash quests in range' }));
    await user.click(screen.getByRole('radio', { name: 'Fast' }));
    await user.click(screen.getByRole('radio', { name: 'Soft pulse' }));
    expect(preview.dataset.sonarSpeed).toBe('fast');
    expect(preview.dataset.sonarLook).toBe('soft');
    await user.click(screen.getByRole('button', { name: /Sonar range ring/ }));
    const field = screen.getByRole('textbox');
    await user.clear(field);
    await user.type(field, '#0055aa');
    expect(preview.style.getPropertyValue('--sonar')).toBe('#0055aa');
    await user.click(screen.getByRole('button', { name: 'Save map style' }));
    expect(api.saveMapStyle).toHaveBeenCalledWith(
      expect.objectContaining({
        sonar: { show: true, color: '#0055aa', speed: 'fast', look: 'soft', ping: false },
      }),
    );
  });

  it('BR48 turning the sonar off also greys out its other settings, and a preset keeps the choice', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MapStyleSettings />
      </ToastProvider>,
    );
    await user.click(screen.getByText('Map style'));
    await user.click(screen.getByRole('switch', { name: 'Show the sonar' }));
    expect(screen.getByRole('switch', { name: 'Flash quests in range' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Slow' })).toBeDisabled();
    const preview = screen.getByRole('img', { name: 'Preview of your map style' });
    expect(preview.dataset.sonar).toBe('off');
    await user.click(screen.getByRole('button', { name: /Ocean/ }));
    expect(preview.dataset.sonar).toBe('off');
    expect(preview.style.getPropertyValue('--sonar')).toBe(PRESETS.ocean.sonar.color);
  });
});
