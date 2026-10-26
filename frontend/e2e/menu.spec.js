import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, shot, login } from './helpers.js';

test.describe('round menu with the slanted trail', () => {
  test('opens, shows five stones, navigates and closes with Escape', async ({ page }, testInfo) => {
    await login(page);
    const trigger = page.getByRole('button', { name: 'Menu' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    for (const label of ['Map', 'Quests', 'Team', 'Ranks', 'Profile']) {
      await expect(page.getByRole('menuitem', { name: new RegExp(label) })).toBeVisible();
    }
    await expect(page.getByRole('menuitem', { name: /Map/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.waitForTimeout(700);
    await shot(page, testInfo, '09-menu-open');

    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByRole('menuitem', { name: /Quests/ }).click();
    await expect(page.getByRole('heading', { name: 'Quests' })).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expectNoHorizontalScroll(page);
  });

  test('keyboard: arrows walk the stones and Tab stays inside the menu', async ({ page }) => {
    await login(page);
    const trigger = page.getByRole('button', { name: 'Menu' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: /Map/ })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('menuitem', { name: /Quests/ })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('menuitem', { name: /Profile/ })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('menuitem', { name: /Profile/ })).toBeFocused();
  });

  test('every screen fits without sideways scrolling', async ({ page }, testInfo) => {
    await login(page);
    for (const [path, heading, name] of [
      ['/quests', 'Quests', '10-quests'],
      ['/team', 'Team', '11-team'],
      ['/ranks', 'Ranks', '12-ranks'],
      ['/profile', 'Profile', '13-profile'],
      ['/city', 'City quests', '14-city'],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      await expectNoHorizontalScroll(page);
      await shot(page, testInfo, name);
    }
  });
});
