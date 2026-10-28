import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, login, shot } from './helpers.js';

const ADMIN = { first: 'Study', last: 'Office', email: 'sekretariat.dski@heilbronn.dhbw.de' };

test.describe('admin navigation and testing', () => {
  test('BR26 the Admin bar sits above Map, opens the dashboard, and the profile has no admin button', async ({
    page,
  }, testInfo) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: 'Open menu' }).click();
    const items = page.getByRole('menuitem');
    await expect(items).toHaveCount(6);
    await expect(items.first()).toContainText('Admin');
    await expect(items.nth(1)).toContainText('Map');
    await page.waitForTimeout(600);
    await shot(page, testInfo, '24-admin-menu');
    await items.first().click();
    await expect(page.getByRole('heading', { name: 'Logins and quests per day' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Checkpoint results' })).toBeVisible();
    await expect(page.getByText('Recent activity')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Show as table' }).click();
    await expect(page.getByRole('columnheader', { name: 'Logins' })).toBeVisible();
    await shot(page, testInfo, '25-admin-dashboard');

    await page.goto('/profile');
    await expect(page.getByRole('link', { name: /Admin area/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete my account' })).toHaveCount(0);
  });

  test('BR38 an admin starts a quiz far away from the campus without a location check', async ({
    page,
    context,
  }, testInfo) => {
    await context.setGeolocation({ latitude: 48.0, longitude: 9.0, accuracy: 10 });
    await login(page, ADMIN);
    await page.goto('/admin/test-quests');
    await expect(page.getByText(/Test mode: you can start any quiz/)).toBeVisible();
    await shot(page, testInfo, '26-admin-test-quests');
    await page.getByRole('link', { name: 'Test quiz' }).first().click();
    await expect(page.getByRole('timer')).toBeVisible();
  });
});

test.describe('player profiles', () => {
  test('BR36 a name in the solo ranking opens a profile with ranks and team; a team member can invite from there', async ({
    page,
  }, testInfo) => {
    await login(page);
    await page.goto('/team');
    await page.getByLabel('Team name *').fill('Night Owls');
    await page.getByRole('button', { name: 'Create team' }).click();
    await expect(page.getByRole('heading', { name: 'Night Owls' })).toBeVisible();

    await page.goto('/ranks');
    await page.getByRole('link', { name: 'Mia K.' }).first().click();
    await expect(page.getByRole('heading', { name: 'Mia K.' })).toBeVisible();
    await expect(page.getByText('Solo rank')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Campus Crew' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Jonas/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Invite to my team' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '27-player-profile');

    await page.getByRole('link', { name: /Jonas/ }).click();
    await expect(page.getByRole('heading', { name: 'Jonas' })).toBeVisible();

    await page.goto('/player/104');
    await page.getByRole('button', { name: 'Invite to my team' }).click();
    await expect(page.getByText(/If the user exists/)).toBeVisible();
    await page.goto('/team');
    await expect(page.getByText(/Invite pending/)).toBeVisible();
    await expect(page.getByText('Sara L.')).toBeVisible();
  });

  test('BR32 the team shows the address that was invited', async ({ page }) => {
    await login(page);
    await page.goto('/team');
    await page.getByLabel('Team name *').fill('Night Owls');
    await page.getByRole('button', { name: 'Create team' }).click();
    await page.getByLabel('School email').fill('mia.k@heilbronn.dhbw.de');
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByText('mia.k@heilbronn.dhbw.de')).toBeVisible();
  });
});
