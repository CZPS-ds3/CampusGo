import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, login, open, shot } from './helpers.js';

test.describe('GO badge menu', () => {
  test('opens five bars, marks the page, navigates and closes with Escape', async ({
    page,
  }, testInfo) => {
    await login(page);
    const trigger = page.getByRole('button', { name: 'Open menu' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    const close = page.getByRole('button', { name: 'Close menu' });
    await expect(close).toHaveAttribute('aria-expanded', 'true');
    for (const label of ['Map', 'Quests', 'Team', 'Ranks', 'Profile']) {
      await expect(page.getByRole('menuitem', { name: new RegExp(label) })).toBeVisible();
    }
    await expect(page.getByRole('menuitem', { name: /Map/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.waitForTimeout(700);
    await shot(page, testInfo, '11-menu-open');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
    await expect(page.getByRole('menuitem')).toHaveCount(0);

    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('menuitem', { name: /Quests/ }).click();
    await expect(page.getByRole('heading', { name: 'Quests' })).toBeVisible();
    await expect(page.getByRole('menuitem')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test('keyboard: arrows walk the bars and Tab stays inside the menu', async ({ page }) => {
    await login(page);
    const trigger = page.getByRole('button', { name: 'Open menu' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: /Map/ })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: /Quests/ })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('menuitem', { name: /Profile/ })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('menuitem', { name: /Profile/ })).toBeFocused();
  });

  test('every screen fits without sideways scrolling', async ({ page }, testInfo) => {
    await login(page);
    for (const [path, heading, name] of [
      ['/quests', 'Quests', '12-quests'],
      ['/team', 'Team', '13-team'],
      ['/ranks', 'Ranks', '14-ranks'],
    ]) {
      await open(page, path);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      await expectNoHorizontalScroll(page);
      await shot(page, testInfo, name);
    }
    await open(page, '/profile');
    await expect(page.getByRole('heading', { name: 'Ada' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '15-profile');
  });
});

test.describe('preferences', () => {
  test('dark mode, font size and German can be switched and are remembered', async ({
    page,
  }, testInfo) => {
    await login(page);
    await open(page, '/profile');
    await page.getByRole('switch', { name: 'Dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('radio', { name: 'Large', exact: true }).click();
    await page.getByRole('radio', { name: 'Deutsch' }).click();
    await expect(page.getByText('Einstellungen')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '16-profile-dark-de');
    await page.reload();
    await open(page, '/profile'); // a reload starts on the map
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByText('Einstellungen')).toBeVisible();
  });
});

test.describe('the app always opens on the map', () => {
  test('a reload or a bookmark of another page, with the session still active, lands on the map', async ({
    page,
  }) => {
    await login(page);
    await open(page, '/profile');
    await expect(page).toHaveURL(/\/profile$/);
    await page.reload();
    await expect(page).toHaveURL(/\/map$/);
    await page.goto('/ranks');
    await expect(page).toHaveURL(/\/map$/);
  });

  test('logging in from another page opens the map, not that page', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login$/);
    await login(page);
    await expect(page).toHaveURL(/\/map$/);
  });
});
