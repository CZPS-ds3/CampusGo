import { expect, test } from '@playwright/test';
import {
  chooseMapView,
  expectNoHorizontalScroll,
  login,
  open,
  openCheckpoint,
  shot,
} from './helpers.js';

// Made-up test positions on the Bildungscampus (the seed's placeholder checkpoints), never a real student's.
const CAMPUS_GARDEN = { latitude: 49.147082, longitude: 9.217206, accuracy: 10 };
const HALFWAY = { latitude: 49.1471, longitude: 9.21785, accuracy: 10 };
const BUILDING_B = { latitude: 49.147126, longitude: 9.218486, accuracy: 10 };

// A minimal street-map style, so the test does not depend on OpenFreeMap being reachable. The tile and aerial
// requests are answered empty; the pins, buttons and switches are what is tested here.
const STYLE = {
  version: 8,
  sources: {
    openmaptiles: { type: 'vector', tiles: ['https://tiles.test/{z}/{x}/{y}.pbf'], maxzoom: 14 },
  },
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef0f2' } }],
};

// A 1x1 grey PNG, so street tiles really load (and show) without the tile server.
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGO4BQAA7gDtjFn3PQAAAABJRU5ErkJggg==',
  'base64',
);

async function offlineMap(page, { styleStatus = 200 } = {}) {
  await page.route('https://tiles.openfreemap.org/styles/**', (route) =>
    styleStatus === 200
      ? route.fulfill({ json: STYLE })
      : route.fulfill({ status: styleStatus, body: 'unavailable' }),
  );
  await page.route('https://tiles.test/**', (route) => route.fulfill({ status: 204 }));
  await page.route('https://owsproxy.lgl-bw.de/**', (route) => route.fulfill({ status: 204 }));
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: TILE_PNG }),
  );
}

/**
 * The OpenStreetMap foot router, answered with a two-leg path. Like the real router it starts on the nearest path,
 * here about 17 m north of the visitor, so the map draws a dotted lead-in to it.
 */
async function fakeRouter(page) {
  await page.route('**/route/v1/foot/**', (route) => {
    const path = new URL(route.request().url()).pathname.split('/').pop();
    const [visitor, to] = path.split(';').map((pair) => pair.split(',').map(Number));
    const from = [visitor[0], visitor[1] + 0.00015];
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    route.fulfill({
      json: {
        routes: [{ geometry: { coordinates: [from, mid, to] }, distance: 95, duration: 70 }],
      },
    });
  });
}

const viewSwitch = (page) => page.getByRole('switch', { name: '3D map' });
const following = (page) => expect(page.getByTestId('recenter')).toHaveClass(/is-following/);
/** Zoom levels of the street tiles on screen (the Leaflet fallback loads whole-number tile levels). */
const tileZooms = (page) =>
  page
    .locator('img.leaflet-tile')
    .evaluateAll((tiles) => [
      ...new Set(tiles.map((tile) => tile.src.match(/openstreetmap\.org\/(\d+)\//)?.[1])),
    ]);
/** The tilt the compass needle shows, in degrees (it tilts with the map). */
const needleTilt = (page) =>
  page
    .locator('.mapctl__needle')
    .evaluate((needle) => Number(needle.style.transform.match(/rotateX\(([\d.]+)deg\)/)?.[1]));

/**
 * Clicks the 2D/3D switch in the page and samples the needle's tilt every 30 ms until it reaches `until` (measured in
 * the page, because the test runner can be slower than the animation).
 */
const switchAndSampleTilt = (page, until) =>
  page.evaluate(
    (end) =>
      new Promise((resolve) => {
        const tilts = [];
        document.querySelector('[role="switch"][aria-label="3D map"]').click();
        const sample = setInterval(() => {
          const tilt = document
            .querySelector('.mapctl__needle')
            ?.style.transform.match(/rotateX\(([\d.]+)deg\)/)?.[1];
          if (tilt !== undefined) tilts.push(Number(tilt));
          if (Math.abs(tilts.at(-1) - end) < 0.1 || tilts.length > 1000) {
            clearInterval(sample);
            resolve(tilts);
          }
        }, 30);
      }),
    until,
  );

test.describe('map buttons, 2D and 3D on one map, and live location', () => {
  test('the 3D view chosen in the preferences opens with pins and the puck; the switch shows the view that is on', async ({
    page,
  }, testInfo) => {
    await offlineMap(page);
    await login(page);
    await open(page, '/profile');
    await page.getByTestId('map-type').getByRole('radio', { name: '3D', exact: true }).click();
    await page.goto('/map');

    const map = page.getByTestId('map-3d');
    await expect(map).toBeVisible({ timeout: 25_000 }); // MapLibre is loaded apart from the app
    await expect(map.locator('canvas.maplibregl-canvas')).toBeVisible();
    await expect(viewSwitch(page)).toHaveText('3D');
    await expect(viewSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: 'Point the map north' })).toBeVisible();
    await expect(map.locator('.puck')).toBeVisible();
    // The credits start closed: only the small "i" button shows.
    await expect(page.locator('.maplibregl-ctrl-attrib')).not.toHaveClass(
      /maplibregl-compact-show/,
    );
    // MapLibre's own buttons are replaced by the shared set.
    await expect(page.locator('.maplibregl-ctrl-zoom-in')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '40-map-3d');

    // A pin opens its checkpoint, also from the keyboard.
    await map.locator('.map3d-pin').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    // 2D is the same map, flat: it still turns, so the compass stays.
    await viewSwitch(page).click();
    await expect(viewSwitch(page)).toHaveText('2D');
    await expect(map).toBeVisible();
    await expect(map.locator('.puck')).toBeVisible();
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Point the map north' })).toBeVisible();
    await expect.poll(() => needleTilt(page), { timeout: 10_000 }).toBe(0);
  });

  test('2D is the turnable MapLibre map; the switch tilts the same map in and out without moving it', async ({
    page,
  }) => {
    await offlineMap(page);
    await login(page);
    await chooseMapView(page, '2d');
    const map = page.getByTestId('map-3d');
    await expect(map).toBeVisible({ timeout: 25_000 });
    await following(page);
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Point the map north' })).toBeVisible();
    await expect(viewSwitch(page)).toHaveText('2D');
    await expect.poll(() => needleTilt(page)).toBe(0);

    // Away from the following view, so the switch keeps the place and the zoom: zoomed out, and the map moved by
    // hand, so it no longer follows (a new reading would otherwise pan it while the test measures).
    for (let step = 0; step < 2; step += 1) {
      await page.getByRole('button', { name: 'Zoom out' }).click();
      await page.waitForTimeout(400);
    }
    const box = await map.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('recenter')).not.toHaveClass(/is-following/);
    const library = map.locator('.map3d-pin[title="Library"]');
    await page.waitForTimeout(1500);
    const before = await library.boundingBox();
    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    const plusIn2d = await zoomIn.boundingBox();

    // Into 3D: the same map tilts in, step by step; no button moves.
    const tiltsIn = await switchAndSampleTilt(page, 55);
    expect(tiltsIn.at(-1)).toBeCloseTo(55, 0);
    expect(tiltsIn.some((tilt) => tilt > 5 && tilt < 50)).toBe(true);
    await expect(viewSwitch(page)).toHaveText('3D');
    expect(await zoomIn.boundingBox()).toEqual(plusIn2d);

    // Back to 2D: the tilt in reverse, on the same map, and the pin is where it was.
    const tiltsOut = await switchAndSampleTilt(page, 0);
    expect(tiltsOut.at(-1)).toBeLessThan(0.1);
    expect(tiltsOut.some((tilt) => tilt > 5 && tilt < 50)).toBe(true);
    await expect(viewSwitch(page)).toHaveText('2D');
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await page.waitForTimeout(300);
    const after = await library.boundingBox();
    expect(Math.abs(after.x - before.x)).toBeLessThan(3);
    expect(Math.abs(after.y - before.y)).toBeLessThan(3);

    // Aerial photo and back to the street map: the map stays where it is.
    await page.getByRole('switch', { name: 'Aerial photo' }).click();
    await page.getByRole('switch', { name: 'Aerial photo' }).click();
    await page.waitForTimeout(300);
    const again = await library.boundingBox();
    expect(Math.abs(again.x - before.x)).toBeLessThan(3);
  });

  test('moving the map stops following; Re-center flies back to the live position', async ({
    page,
  }, testInfo) => {
    await offlineMap(page);
    await login(page);
    await page.goto('/map');
    const map = page.getByTestId('map-3d');
    await expect(map.locator('.puck')).toBeVisible({ timeout: 25_000 });
    await following(page);

    const box = await map.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('recenter')).not.toHaveClass(/is-following/);
    await expect(page.getByTestId('recenter').getByText('Re-center')).toBeVisible();
    await shot(page, testInfo, '41-map-recenter');

    await page.getByRole('button', { name: 'Re-center' }).click();
    await following(page);
  });

  test('on the Leaflet fallback, the walking route starts at the live position and shrinks while walking', async ({
    page,
    context,
  }) => {
    // The Leaflet map draws the route as SVG paths that can be measured here; MapLibre draws it into its canvas (its
    // route layers are checked in map-3d.test.js).
    await context.setGeolocation(CAMPUS_GARDEN);
    await offlineMap(page, { styleStatus: 503 });
    await fakeRouter(page);
    await login(page);
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 25_000 });
    await openCheckpoint(page, 'Building B');
    await page.getByRole('button', { name: 'Show walking route' }).click();

    const status = page.getByRole('status').filter({ hasText: 'Route to Building B' });
    await expect(status).toBeVisible();
    const metres = async () => Number((await status.textContent()).match(/(\d+) m/)[1]);
    const atStart = await metres();
    expect(atStart).toBeGreaterThan(80);
    // The dotted curve from the visitor to where the route starts, as wide as the route.
    await expect(page.locator('.leaflet-overlay-pane path[stroke-dasharray="1 10"]')).toHaveCount(
      1,
    );
    await expect(
      page.locator('.leaflet-overlay-pane path[stroke-dasharray="1 10"]'),
    ).toHaveAttribute('stroke-width', '5');

    await context.setGeolocation(HALFWAY);
    await expect.poll(metres).toBeLessThan(atStart - 30);

    await context.setGeolocation(BUILDING_B);
    await expect(page.getByText('You have arrived at Building B.')).toBeVisible();
  });

  test('when MapLibre cannot load, the student is told and gets the flat Leaflet map, which still draws the closest zoom', async ({
    page,
  }) => {
    await offlineMap(page, { styleStatus: 503 });
    await login(page);
    await chooseMapView(page, '2d');
    // The dev server needs a while for MapLibre the first time when many tests run in parallel.
    await expect(
      page.getByText('The turnable map could not be loaded, so a simpler flat map is shown.'),
    ).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.leaflet-container')).toBeVisible();
    // The fallback cannot turn, so it has no compass.
    await expect(page.getByRole('button', { name: 'Point the map north' })).toHaveCount(0);
    await following(page);

    // New accounts start on the street map; wait for the fly-in to the close following view (on a phone the closest
    // zoom, drawn with the street server's last tiles, 19), then zoom step by step (a click during an animation would
    // be cut short).
    await expect(page.getByRole('switch', { name: 'Aerial photo' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect.poll(() => tileZooms(page), { timeout: 20_000 }).toEqual(['19']);
    // Closer than the tile server goes: its last level is enlarged instead of the map going blank.
    for (let step = 0; step < 2; step += 1) {
      await page.getByRole('button', { name: 'Zoom in' }).click();
      await page.waitForTimeout(400);
    }
    await expect.poll(() => tileZooms(page)).toEqual(['19']);
    await expect(page.locator('img.leaflet-tile').first()).toBeVisible();

    // 3D tries MapLibre again; when it still cannot load, the student is told and keeps the flat map.
    await viewSwitch(page).click();
    await expect(
      page.getByText('The 3D map could not be loaded, so the flat map is shown.'),
    ).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(viewSwitch(page)).toHaveText('2D');
  });

  test('checkpoint card: the status sits below the name and the X stays in the corner while it scrolls', async ({
    page,
  }) => {
    await login(page);
    await openCheckpoint(page, 'Building B');
    const card = page.getByRole('dialog');
    // Measure after the card has slid up.
    await card.evaluate((box) => Promise.all(box.getAnimations().map((done) => done.finished)));
    const status = card.getByText('Open', { exact: true });
    const name = card.getByRole('heading', { name: 'Building B' });
    await card.evaluate((box) => box.scrollTo(0, 0));
    expect((await status.boundingBox()).y).toBeGreaterThan((await name.boundingBox()).y);

    const close = card.getByRole('button', { name: 'Close checkpoint' });
    const atTop = await close.boundingBox();
    await card.evaluate((box) => box.scrollTo(0, box.scrollHeight));
    await page.waitForTimeout(200);
    expect(await close.boundingBox()).toEqual(atTop);
    await close.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('BR48 regression: the tint shows on the flat Leaflet street map, the aerial photo stays untinted', async ({
    page,
  }) => {
    await offlineMap(page, { styleStatus: 503 });
    await login(page);
    await open(page, '/profile');
    const settings = page.getByTestId('map-style');
    await settings.locator('summary').click();
    await settings.getByRole('button', { name: 'Next map theme' }).click(); // Ocean: tint 30 %
    await expect(settings.getByTestId('map-theme-name')).toContainText('Ocean');
    await settings.getByRole('button', { name: 'Save customisation' }).click();
    await expect(page.getByText('Customisation saved')).toBeVisible();

    await page.goto('/map');
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 25_000 });
    const opacityOf = (selector) =>
      page
        .locator(selector)
        .first()
        .evaluate((layer) => getComputedStyle(layer).opacity);
    // Leaflet writes an inline opacity of 1 on every tile layer; the tint must still win on the street map (where
    // new accounts start).
    await expect.poll(() => opacityOf('.leaflet-container .map-tiles--street')).toBe('0.7');
    await page.getByRole('switch', { name: 'Aerial photo' }).click();
    await expect(page.locator('.leaflet-container .map-tiles--street')).toHaveCount(0);
    await expect.poll(() => opacityOf('.leaflet-container .leaflet-layer')).toBe('1');
  });

  test('BR48 Customisation offers a colour for the 3D buildings, edited in a popup', async ({
    page,
  }) => {
    await login(page);
    await open(page, '/profile');
    const settings = page.getByTestId('map-style');
    await settings.locator('summary').click();
    await settings.getByRole('button', { name: 'Buildings (3D map)' }).dblclick();
    const popup = page.getByRole('dialog', { name: 'Buildings (3D map)' });
    await popup.getByTestId('colour-Buildings (3D map)').getByLabel('Colour code').fill('#123456');
    await popup.getByRole('button', { name: 'Close' }).click();
    await expect(popup).toHaveCount(0);
    await settings.getByRole('button', { name: 'Save customisation' }).click();
    await expect(page.getByText('Customisation saved')).toBeVisible();
    await page.reload();
    await open(page, '/profile'); // a reload starts on the map
    await page.getByTestId('map-style').locator('summary').click();
    await page
      .getByTestId('map-style')
      .getByRole('button', { name: 'Buildings (3D map)' })
      .dblclick();
    await expect(
      page.getByTestId('colour-Buildings (3D map)').getByLabel('Colour code'),
    ).toHaveValue('#123456');
  });
});
