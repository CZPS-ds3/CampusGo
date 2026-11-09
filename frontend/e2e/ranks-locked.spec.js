import { expect, test } from '@playwright/test';
import { login } from './helpers.js';

test('BR06 "Go to team" sits right below "Team ranks locked", its G under the lock icon', async ({
  page,
}) => {
  await login(page);
  await page.goto('/ranks');
  const chip = await page.getByText('Team ranks locked').last().boundingBox();
  const lock = await page.locator('.ranks__locked .chip svg').boundingBox();
  const link = await page.getByRole('link', { name: 'Go to team' }).boundingBox();
  expect(link.y).toBeGreaterThanOrEqual(chip.y + chip.height);
  expect(link.y - (chip.y + chip.height)).toBeLessThanOrEqual(16);
  expect(Math.abs(link.x - lock.x)).toBeLessThanOrEqual(2);
});
