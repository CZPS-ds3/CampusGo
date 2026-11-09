import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, login } from './helpers.js';

const ADMIN = { first: 'Study', last: 'Office', email: 'sekretariat.dski@heilbronn.dhbw.de' };
const CLOSE = { name: 'Close and go to the map' };

const centre = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

test.describe('X button on every page except the map', () => {
  test('it is not on the map', async ({ page }) => {
    await login(page);
    await page.goto('/map');
    await expect(page.getByRole('link', { name: 'Open profile' })).toBeVisible();
    await expect(page.getByRole('button', CLOSE)).toHaveCount(0);
  });

  test('it sits in the same place on every page and closes to the map', async ({ page }) => {
    await login(page);
    const boxes = [];
    for (const path of ['/quests', '/team', '/ranks', '/profile']) {
      await page.goto(path);
      const close = page.getByRole('button', CLOSE);
      await expect(close).toBeVisible();
      boxes.push(await close.boundingBox());
      await expectNoHorizontalScroll(page);
    }
    for (const box of boxes) expect(box).toEqual(boxes[0]);
    const viewport = page.viewportSize();
    expect(viewport.width - (boxes[0].x + boxes[0].width)).toBeLessThanOrEqual(32);

    await page.getByRole('button', CLOSE).click();
    await expect(page).toHaveURL(/\/map$/);
  });

  test('its middle is level with the middle of the page title', async ({ page }) => {
    await login(page);
    await page.goto('/quests');
    const title = await page.getByRole('heading', { name: 'Quests', level: 1 }).boundingBox();
    const close = await page.getByRole('button', CLOSE).boundingBox();
    expect(Math.abs(centre(title).y - centre(close).y)).toBeLessThanOrEqual(2);
  });

  test('the refresh button sits left of the X, level with it', async ({ page }) => {
    await login(page);
    await page.goto('/ranks');
    const close = await page.getByRole('button', CLOSE).boundingBox();
    const refresh = await page.getByRole('button', { name: 'Refresh ranks' }).boundingBox();
    expect(refresh.x + refresh.width).toBeLessThanOrEqual(close.x);
    expect(close.x - (refresh.x + refresh.width)).toBeLessThanOrEqual(12);
    expect(Math.abs(centre(refresh).y - centre(close).y)).toBeLessThanOrEqual(1);
    await expectNoHorizontalScroll(page);
  });

  test('the buttons stay on screen while the page scrolls', async ({ page }) => {
    await login(page);
    await page.goto('/profile');
    const before = await page.getByRole('button', CLOSE).boundingBox();
    await page.evaluate(() => {
      document.body.style.minHeight = '3000px'; // some pages are shorter than the window
      window.scrollTo(0, 600);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(50);
    expect(await page.getByRole('button', CLOSE).boundingBox()).toEqual(before);
    await page.goto('/ranks');
    const refresh = await page.getByRole('button', { name: 'Refresh ranks' }).boundingBox();
    await page.evaluate(() => {
      document.body.style.minHeight = '3000px';
      window.scrollTo(0, 400);
    });
    expect(await page.getByRole('button', { name: 'Refresh ranks' }).boundingBox()).toEqual(
      refresh,
    );
  });

  test('the admin pages have it in the same place', async ({ page, browser }) => {
    await login(page);
    await page.goto('/quests');
    const reference = await page.getByRole('button', CLOSE).boundingBox();

    const context = await browser.newContext({ viewport: page.viewportSize(), locale: 'en-US' });
    const adminPage = await context.newPage();
    await login(adminPage, ADMIN);
    await adminPage.goto('/admin');
    await expect(adminPage.getByRole('button', CLOSE)).toBeVisible();
    expect(await adminPage.getByRole('button', CLOSE).boundingBox()).toEqual(reference);
    await context.close();
  });
});
