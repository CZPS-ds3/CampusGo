import { expect, test } from '@playwright/test';
import { OTP, expectNoHorizontalScroll, login, shot } from './helpers.js';

// 2026-11-10: leaving a team and the team order (BR54), the code preview switch (BR52) and the picture chosen on
// the sign-up page (BR02). Mock API, every screen size of playwright.config.js.

const ADMIN = { first: 'Study', last: 'Office', email: 'sekretariat.dski@heilbronn.dhbw.de' };

// A 1x1 red PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('BR54 leaving a team', () => {
  test('BR54 the last member leaves after a confirmation and the team is gone', async ({
    page,
  }, testInfo) => {
    await login(page);
    await page.goto('/team');
    await page.getByLabel('Team name *').fill('Night Owls');
    await page.getByRole('button', { name: 'Create team' }).click();
    await expect(page.getByRole('heading', { name: 'Night Owls' })).toBeVisible();
    await page.getByRole('button', { name: 'Leave the team Night Owls' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('You are the last member, so the team is deleted.');
    await shot(page, testInfo, '40-leave-team');
    await expectNoHorizontalScroll(page);
    await dialog.getByRole('button', { name: 'Yes, leave' }).click();
    await expect(page.getByText('You left the team.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create team' })).toBeVisible();
  });

  test('BR05 a team name needs at least 3 characters', async ({ page }) => {
    await login(page);
    await page.goto('/team');
    await page.getByLabel('Team name *').fill('AB');
    await page.getByRole('button', { name: 'Create team' }).click();
    await expect(page.getByText('A team name has 3 to 30 characters.')).toBeVisible();
  });
});

test.describe('BR54 the admin chooses the leader and the order', () => {
  test('BR54 an admin makes another member the leader and moves them up', async ({
    page,
  }, testInfo) => {
    await login(page, ADMIN);
    await page.goto('/admin/teams');
    const order = page.getByRole('list', {
      name: 'Members of Bildungscampus Bandits in team order',
    });
    await expect(order.getByRole('listitem').first()).toContainText('Mira');
    await expect(order.getByRole('listitem').first()).toContainText('Leader');
    await order.getByRole('button', { name: 'Make leader: Tomi' }).click();
    await expect(page.getByText('Tomi now leads the team')).toBeVisible();
    await expect(order.getByRole('listitem').nth(1)).toContainText('Leader');
    await order.getByRole('button', { name: 'Move Tomi up' }).click();
    await expect(page.getByText('Order saved')).toBeVisible();
    await expect(order.getByRole('listitem').first()).toContainText('Tomi');
    await expect(order.getByRole('button', { name: 'Move Tomi up' })).toBeDisabled();
    await shot(page, testInfo, '41-admin-team-order');
    await expectNoHorizontalScroll(page);
  });
});

test.describe('BR52 the code preview switch', () => {
  test('BR52 the admin turns the preview off and the login page has no test inbox any more', async ({
    page,
  }, testInfo) => {
    await login(page, ADMIN);
    await page.goto('/admin/settings');
    const toggle = page.getByRole('switch', { name: 'Show login codes on the login page' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/Anyone can log in as anyone/)).toBeVisible();
    await shot(page, testInfo, '42-admin-settings');
    await expectNoHorizontalScroll(page);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(page.getByRole('alertdialog')).toContainText(
      'Show login codes on the login page?',
    );
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    await page.goto('/profile');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click();
    // Signing out navigates by itself; going to /login before it settles detached the e-mail field (flaky).
    await expect(page).not.toHaveURL(/\/profile/);
    await page.waitForLoadState('networkidle');
    await page.goto('/login');
    await expect(page.getByLabel('School email')).toBeEditable();
    await page.getByLabel('School email').fill('ada@heilbronn.dhbw.de');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('heading', { name: /6-digit code/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Open mock inbox/ })).toHaveCount(0);
  });

  test('BR52 with the preview on, the test inbox fills in the code', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('School email').fill('ada@heilbronn.dhbw.de');
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByRole('button', { name: /Open mock inbox/ }).click();
    await expect(page.getByText(OTP)).toBeVisible();
    await page.getByRole('button', { name: 'Use this code' }).click();
    await expect(page.getByLabel('First name *')).toBeVisible();
  });
});

test.describe('BR02 the sign-up picture', () => {
  test('BR02 the picture chosen on the sign-up page shows at once after login', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('School email').fill('pic@heilbronn.dhbw.de');
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByLabel('Digit 1 of 6').click();
    await page.keyboard.insertText(OTP);
    await page.getByLabel('Upload profile picture').setInputFiles({
      name: 'me.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await page.getByLabel('First name *').fill('Pia');
    await page.getByLabel('Last name *').fill('Picture');
    await page.getByRole('button', { name: 'Enter campus' }).click();
    const profileLink = page.getByRole('link', { name: 'Open profile' });
    await expect(profileLink).toBeVisible();
    // No reload and no waiting for the next session refresh: the uploaded picture is shown right away.
    await expect(profileLink.locator('img')).toHaveAttribute('src', /^data:image\/png/);
    await page.goto('/profile');
    await expect(page.locator('img[src^="data:image/png"]').first()).toBeVisible();
  });
});
