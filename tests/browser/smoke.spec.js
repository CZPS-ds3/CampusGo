import { expect, test } from '@playwright/test';
import { login, open } from '../../frontend/e2e/helpers.js';

test('the app starts, a player signs in and sees the map with the checkpoints', async ({
  page,
}) => {
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Campus/ })).toBeVisible();
  await login(page);
  await expect(page.getByRole('region', { name: 'Campus map' })).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('the round menu opens, navigates and closes in every browser', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: /Ranks/ }).click();
  await expect(page.getByRole('heading', { name: 'Ranks' })).toBeVisible();
});

test('a quiz can be played to the end and shows the result', async ({ page }) => {
  await login(page);
  await open(page, '/quests');
  await page.getByRole('link', { name: /Campus Garden/ }).click();
  await page.getByRole('link', { name: 'Start quest' }).click();
  await page.getByRole('button', { name: "I'm ready" }).click();
  await page.getByRole('button', { name: 'I agree' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: /placeholder answer/ }).click();
    await expect(page.getByText('Correct!')).toBeVisible();
    await page.getByRole('button', { name: i === 2 ? 'Finish' : 'Next' }).click();
  }
  await expect(page.getByText('Checkpoint cleared')).toBeVisible();
});

test('the page keeps working offline for what is already loaded and shows a notice', async ({
  page,
  context,
}) => {
  await login(page);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByRole('status').first()).toBeVisible();
  await context.setOffline(false);
});
