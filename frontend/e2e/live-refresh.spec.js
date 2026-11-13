import { expect, test } from '@playwright/test';
import { login, open } from './helpers.js';

// BR12: on the map the live position gets a reading at least every 3 seconds. A simulated position (as here and in
// DevTools) reports only once per watch, so the map has to restart its watch to get one; this counts the restarts.
test.describe('BR12 the live ball is refreshed at least every 3 seconds', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const geolocation = navigator.geolocation;
      const watch = geolocation.watchPosition.bind(geolocation);
      window.__watches = 0;
      geolocation.watchPosition = (...args) => {
        window.__watches += 1;
        return watch(...args);
      };
    });
  });

  test('BR12 the map restarts a quiet watch and the ball stays on the position', async ({
    page,
  }) => {
    await login(page);
    await expect(page.locator('.puck').first()).toBeVisible();
    const before = await page.evaluate(() => window.__watches);
    // About 6 seconds without a new reading: at least two fresh readings asked for (one every 2 to 3 s).
    await expect
      .poll(() => page.evaluate(() => window.__watches), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(before + 2);
    await expect(page.locator('.puck').first()).toBeVisible();
  });

  test('BR12 BR13 after the map, the location check still gets its reading', async ({ page }) => {
    await login(page);
    await expect(page.locator('.puck').first()).toBeVisible();
    // Long enough on the map for the watch to have been restarted.
    await expect
      .poll(() => page.evaluate(() => window.__watches), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2);
    await open(page, '/quests');
    await page.getByRole('link', { name: /Library/ }).click();
    await page.getByRole('link', { name: 'Start quest' }).click();
    await page.getByRole('button', { name: "I'm ready" }).click();
    await page.getByRole('button', { name: 'I agree' }).click();
    await expect(page.getByText('Locked on!')).toBeVisible({ timeout: 25_000 });
  });
});

test('BR48 the student colours the ball and the map shows it in those colours', async ({
  page,
}) => {
  await login(page);
  await open(page, '/profile');
  const settings = page.getByTestId('map-style');
  await settings.locator('summary').click();
  await settings.getByRole('button', { name: /Your position: ball/ }).click();
  await settings
    .getByTestId('colour-Your position: ball')
    .getByLabel('Colour code')
    .fill('#0055aa');
  await settings.getByRole('button', { name: /Your position: lines/ }).click();
  await settings
    .getByTestId('colour-Your position: lines and direction')
    .getByLabel('Colour code')
    .fill('rgb(255, 200, 0)');
  await settings.getByRole('button', { name: 'Save map style' }).click();
  await expect(page.getByText('Map style saved')).toBeVisible();
  await page.goto('/map');
  const facet = page.locator('.puck__facet').first();
  await expect(facet).toBeAttached();
  await expect
    .poll(() => facet.evaluate((element) => getComputedStyle(element).fill))
    .toBe('rgb(0, 85, 170)');
  const edges = page.locator('.puck__edges').first();
  await expect
    .poll(() => edges.evaluate((element) => getComputedStyle(element).stroke))
    .toBe('rgb(255, 200, 0)');
});
