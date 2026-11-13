import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, login, open, shot } from './helpers.js';

const ADMIN = { first: 'Study', last: 'Office', email: 'sekretariat.dski@heilbronn.dhbw.de' };

test.describe('invitations', () => {
  test('BR05 a sent invitation shows as a pending slot and a team never goes past 5', async ({
    page,
  }, testInfo) => {
    await login(page);
    await open(page, '/team');
    await page.getByLabel('Team name *').fill('Night Owls');
    await page.getByRole('button', { name: 'Create team' }).click();
    await expect(page.getByRole('heading', { name: 'Night Owls' })).toBeVisible();

    await page.getByLabel('School email').fill('nobody@heilbronn.dhbw.de');
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByText(/If the user exists/).first()).toBeVisible();
    await expect(page.getByText(/Invite pending/)).toHaveCount(0);

    for (const [index, local] of ['mia.k', 'jonas', 'aiko.t', 'sara.l'].entries()) {
      await page.getByLabel('School email').fill(`${local}@heilbronn.dhbw.de`);
      await page.getByRole('button', { name: 'Send invite' }).click();
      // The slot is the proof that the invitation exists; wait for it before the next one.
      await expect(page.getByText(/Invite pending/)).toHaveCount(index + 1);
      await expect(page.getByText('Invitation sent.')).toBeVisible();
    }
    await expect(page.getByText(/Invite pending/)).toHaveCount(4);
    await expect(page.getByText('Your team is full (5 of 5)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send invite' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '20-team-invites');
  });
});

test.describe('place photos', () => {
  test('the carousel moves on after 5 seconds and can be stepped by hand', async ({ page }) => {
    await page.clock.install();
    await login(page);
    await open(page, '/quests');
    // The Library has several of the team's photos (the Mensa now has one, which does not move).
    await page.getByRole('link', { name: /Library/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('group', { name: /Photos of Library/ })).toBeVisible();
    const dot = (n) => dialog.getByRole('button', { name: `Photo ${n} of 9` });
    // A known start: the first photo, then pointer and focus off the carousel (both pause it). The 5 s timer starts
    // again only now, so time that passed while the page loaded on a busy machine cannot move it on twice.
    await dot(1).click();
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.activeElement?.blur());
    await expect(dot(1)).toHaveAttribute('aria-current', 'true');
    await page.clock.fastForward(5200);
    await expect(dot(2)).toHaveAttribute('aria-current', 'true');
    await dialog.getByRole('button', { name: 'Previous photo' }).click();
    await expect(dot(1)).toHaveAttribute('aria-current', 'true');
  });
});

test.describe('admin area', () => {
  test('BR26 only the secretariat account sees it; users can be blocked, created without duplicates and names are checked', async ({
    page,
  }, testInfo) => {
    await login(page);
    await open(page, '/admin');
    await expect(page).toHaveURL(/\/map/);
    await page.goto('/');
    await page.evaluate(() => sessionStorage.clear());

    await login(page, ADMIN);
    await open(page, '/admin');
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
    await expect(page.getByText('Active players')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '21-admin-overview');

    await page.getByRole('link', { name: 'Users' }).click();
    await page.getByLabel('Search name or email').fill('lars');
    await page.getByRole('link', { name: /Lars Nordmann/ }).click();
    await page.getByRole('button', { name: 'Block from playing' }).click();
    await expect(page.getByRole('button', { name: 'Unblock' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '22-admin-user');

    await page.getByRole('link', { name: 'All users' }).click();
    await page.getByRole('button', { name: 'New account' }).first().click();
    await page.getByLabel('First name').fill('Lars');
    await page.getByLabel('Last name').fill('Duplicate');
    await page.getByLabel('School email').fill('Lars.Nordmann@heilbronn.dhbw.de');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText(/already belongs to an account/)).toBeVisible();

    await page.getByRole('link', { name: 'Names' }).click();
    await expect(page.getByRole('heading', { name: 'Name rules' })).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill('Cass');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText('Allowed.', { exact: true })).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill('Big Ass');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText(/Not allowed/)).toBeVisible();
    await shot(page, testInfo, '23-admin-names');
  });
});

test.describe('delete my account', () => {
  test('BR30 the profile can delete the account after a confirmation', async ({ page }) => {
    await login(page);
    await open(page, '/profile');
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Keep my account' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await page.getByRole('button', { name: 'Yes, delete it' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/map');
    await expect(page).toHaveURL(/\/login/);
  });
});
