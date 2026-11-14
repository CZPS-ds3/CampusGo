// The background check of the device: new accounts start on the street map, in 3D when the device can run it
// smoothly and in 2D otherwise. jsdom has no WebGL, so it is faked per test; the modules are loaded fresh each time
// because the check runs once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const realGetContext = window.HTMLCanvasElement.prototype.getContext;

/** Fakes WebGL: `chip` = a graphics chip (no software fallback), plus the cores and memory the browser reports. */
function fakeDevice({ webgl = true, chip = true, cores = 8, memory = 8 } = {}) {
  if (webgl) window.WebGLRenderingContext = function WebGLRenderingContext() {};
  window.HTMLCanvasElement.prototype.getContext = (type, options) => {
    if (!webgl || !type.startsWith('webgl')) return null;
    if (options?.failIfMajorPerformanceCaveat && !chip) return null;
    return { getExtension: () => null };
  };
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: cores, configurable: true });
  Object.defineProperty(navigator, 'deviceMemory', { value: memory, configurable: true });
}

async function newAccount() {
  const settings = await import('../src/i18n.js');
  settings.applyNewAccountMapDefaults();
  return { base: settings.getMapBase(), view: settings.getMapView() };
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

afterEach(() => {
  delete window.WebGLRenderingContext;
  window.HTMLCanvasElement.prototype.getContext = realGetContext;
  delete navigator.hardwareConcurrency;
  delete navigator.deviceMemory;
});

describe('the map a new account starts with', () => {
  it('a strong device starts on the street map in 3D', async () => {
    fakeDevice();
    expect(await newAccount()).toEqual({ base: 'street', view: '3d' });
  });

  it('a device that would draw in software (no graphics chip) starts in 2D', async () => {
    fakeDevice({ chip: false });
    expect(await newAccount()).toEqual({ base: 'street', view: '2d' });
  });

  it('a device with few cores or little memory starts in 2D', async () => {
    fakeDevice({ cores: 2 });
    expect((await newAccount()).view).toBe('2d');
    vi.resetModules();
    fakeDevice({ memory: 2 });
    expect((await newAccount()).view).toBe('2d');
  });

  it('a device without WebGL starts in 2D', async () => {
    fakeDevice({ webgl: false });
    expect(await newAccount()).toEqual({ base: 'street', view: '2d' });
  });

  it('a choice the student made on this device stays, also over the device check', async () => {
    fakeDevice();
    localStorage.setItem('ccq-settings-v1', JSON.stringify({ mapBase: 'aerial', mapView: '2d' }));
    const settings = await import('../src/i18n.js');
    expect(settings.getMapBase()).toBe('aerial');
    expect(settings.getMapView()).toBe('2d');
  });
});
