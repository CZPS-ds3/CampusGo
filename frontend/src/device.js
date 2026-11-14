// What this device can draw, checked once in the background with throwaway canvases: the MapLibre map needs WebGL,
// and the 3D map also wants a graphics chip (not the slow software fallback) and a few cores and some memory.

let webgl;
let strong;

/** A WebGL context of a throwaway canvas (released at once), or null. */
function tryWebGl(options) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', options) ?? canvas.getContext('webgl', options);
  context?.getExtension('WEBGL_lose_context')?.loseContext();
  return context;
}

/** Whether this browser can draw the MapLibre map at all (jsdom and very old browsers cannot). */
export function canDrawWebGl() {
  if (webgl !== undefined) return webgl;
  try {
    webgl = typeof window.WebGLRenderingContext !== 'undefined' && Boolean(tryWebGl());
  } catch {
    webgl = false;
  }
  return webgl;
}

/**
 * Whether the 3D map should run smoothly here: WebGL on the graphics chip (`failIfMajorPerformanceCaveat` refuses
 * a software fallback), at least 4 cores and 4 GB of memory where the browser tells, and no data saver.
 */
export function isStrongDevice() {
  if (strong !== undefined) return strong;
  try {
    const cores = navigator.hardwareConcurrency ?? 4;
    const memory = navigator.deviceMemory ?? 4;
    const saveData = navigator.connection?.saveData === true;
    strong =
      canDrawWebGl() &&
      cores >= 4 &&
      memory >= 4 &&
      !saveData &&
      Boolean(tryWebGl({ failIfMajorPerformanceCaveat: true }));
  } catch {
    strong = false;
  }
  return strong;
}
