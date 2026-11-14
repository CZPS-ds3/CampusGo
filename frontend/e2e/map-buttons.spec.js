import { expect, test } from '@playwright/test';
import { chooseMapView, login, open } from './helpers.js';

// Every map button must take a tap wherever it is touched: nothing (the map, its markers, the sonar ring, the credits
// or the GO ball of the menu) may lie over it, on the narrowest phone and with the largest text too.

const STYLE = {
  version: 8,
  sources: {
    openmaptiles: { type: 'vector', tiles: ['https://tiles.test/{z}/{x}/{y}.pbf'], maxzoom: 14 },
  },
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef0f2' } }],
};

async function offlineMap(page, { styleStatus = 200 } = {}) {
  await page.route('https://tiles.openfreemap.org/styles/**', (route) =>
    styleStatus === 200
      ? route.fulfill({ json: STYLE })
      : route.fulfill({ status: styleStatus, body: 'unavailable' }),
  );
  await page.route('https://tiles.test/**', (route) => route.fulfill({ status: 204 }));
  await page.route('https://owsproxy.lgl-bw.de/**', (route) => route.fulfill({ status: 204 }));
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ status: 204 }));
}

/**
 * The buttons on the map whose centre or edges something else covers: for each button, the element the browser would
 * hand a tap to at nine points inside it (centre, edges and corners, 4 px in) must be the button or a part of it.
 */
const coveredButtons = (page) =>
  page.evaluate(() => {
    const buttons = [
      ...document.querySelectorAll(
        '.recenter, .mapctl__btn, .ball, .maplibregl-ctrl-attrib-button',
      ),
    ];
    const covered = [];
    for (const button of buttons) {
      const box = button.getBoundingClientRect();
      if (box.width === 0 || getComputedStyle(button).visibility === 'hidden') continue;
      const xs = [box.left + 4, box.left + box.width / 2, box.right - 4];
      const ys = [box.top + 4, box.top + box.height / 2, box.bottom - 4];
      for (const x of xs) {
        for (const y of ys) {
          const hit = document.elementFromPoint(x, y);
          if (!button.contains(hit)) {
            covered.push(
              `${button.className || button.tagName} at ${Math.round(x)},${Math.round(y)}: ${hit?.className || hit?.tagName}`,
            );
          }
        }
      }
    }
    return covered;
  });

/** Waits until the map has come to rest: the ball stays in the same place on screen for half a second. */
async function mapAtRest(page) {
  const ball = page.getByTestId('map-3d').locator('.puck').first();
  const where = async () => {
    const box = await ball.boundingBox();
    return box ? `${Math.round(box.x)},${Math.round(box.y)}` : '';
  };
  await expect
    .poll(
      async () => {
        const before = await where();
        await page.waitForTimeout(500);
        return before === (await where());
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}

test.describe('every map button takes a tap', () => {
  test('in 2D and 3D, while following, after moving the map and during the fly-in', async ({
    page,
  }) => {
    await offlineMap(page);
    await login(page);
    await page.goto('/map');
    const map = page.getByTestId('map-3d');
    await expect(map.locator('.puck')).toBeVisible({ timeout: 25_000 });
    const recenter = page.getByTestId('recenter');
    await expect(recenter).toHaveClass(/is-following/);
    expect(await coveredButtons(page)).toEqual([]);
    await mapAtRest(page); // the first fly-in has landed

    // Moved away: the wide Re-center button. Dragged from the upper part of the map, away from the pins and the ball.
    const box = await map.boundingBox();
    const from = { x: box.x + box.width * 0.35, y: box.y + box.height * 0.4 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 140, from.y + 90, { steps: 8 });
    await page.mouse.up();
    await expect(recenter).not.toHaveClass(/is-following/);
    expect(await coveredButtons(page)).toEqual([]);

    // During the fly-in a second tap still lands on Re-center.
    await recenter.click();
    expect(await coveredButtons(page)).toEqual([]);
    await recenter.click();
    await expect(recenter).toHaveClass(/is-following/);

    // The other view of the same map: every button still takes a tap, each on the first try.
    const view = page.getByRole('switch', { name: '3D map' });
    const before = await view.textContent();
    await view.click();
    await expect(view).not.toHaveText(before);
    await page.waitForTimeout(800);
    expect(await coveredButtons(page)).toEqual([]);
    for (const name of ['Zoom in', 'Zoom out', 'Point the map north', 'Re-center']) {
      await page.getByRole('button', { name }).click({ timeout: 3000 });
    }
    await expect(recenter).toHaveClass(/is-following/);
  });

  test('with the largest text the wide Re-center button stays clear of the GO ball', async ({
    page,
  }) => {
    await offlineMap(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await login(page);
    await open(page, '/profile');
    await page.getByRole('radio', { name: 'Extra large' }).click();
    await open(page, '/map');
    const map = page.getByTestId('map-3d');
    await expect(map.locator('.puck')).toBeVisible({ timeout: 25_000 });
    const box = await map.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 60, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('recenter')).not.toHaveClass(/is-following/);
    await page.waitForTimeout(400);
    expect(await coveredButtons(page)).toEqual([]);
  });

  test('Re-center always lands on the ball in the close following view, also while the map pans to new readings', async ({
    page,
    context,
  }) => {
    await offlineMap(page);
    await login(page);
    await chooseMapView(page, '2d');
    const map = page.getByTestId('map-3d');
    await expect(map.locator('.puck')).toBeVisible({ timeout: 25_000 });
    const recenter = page.getByTestId('recenter');
    await expect(recenter).toHaveClass(/is-following/);
    await page.waitForTimeout(2500); // the first fly-in

    // GPS readings keep coming (a phone standing still jitters by a few decimetres), so the map keeps panning gently
    // to each one. Zoomed out with the buttons, the map still follows; then Re-center is tapped in the middle of a pan.
    let jitter = true;
    const readings = (async () => {
      for (let n = 0; jitter; n += 1) {
        await context.setGeolocation({
          latitude: 49.149493 + (n % 2) * 0.000003,
          longitude: 9.216467,
          accuracy: 5,
        });
        await page.waitForTimeout(250);
      }
    })();
    for (let step = 0; step < 3; step += 1) {
      await page.getByRole('button', { name: 'Zoom out' }).click();
      await page.waitForTimeout(350);
    }
    await page.waitForTimeout(1000);
    const box = await map.boundingBox();
    await recenter.click();
    await page.waitForTimeout(3500);
    jitter = false;
    await readings;
    await page.waitForTimeout(1500);

    await expect(recenter).toHaveClass(/is-following/);
    // The close following view: the ball at full size, low in the middle of the map.
    const scale = await map.evaluate((element) =>
      Number(getComputedStyle(element).getPropertyValue('--puck-scale')),
    );
    expect(scale).toBeGreaterThan(0.99);
    const ball = await map.locator('.puck').first().boundingBox();
    const middle = { x: box.x + box.width / 2, y: box.y + box.height * 0.7 };
    expect(Math.abs(ball.x + ball.width / 2 - middle.x)).toBeLessThan(30);
    expect(Math.abs(ball.y + ball.height / 2 - middle.y)).toBeLessThan(30);
  });

  test('on the Leaflet fallback too', async ({ page }) => {
    await offlineMap(page, { styleStatus: 503 });
    await login(page);
    await page.goto('/map');
    await expect(page.locator('.leaflet-container .puck')).toBeVisible({ timeout: 25_000 });
    expect(await coveredButtons(page)).toEqual([]);
    await page.getByTestId('recenter').click({ timeout: 3000 });
  });
});
