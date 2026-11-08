import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, login, openCheckpoint, rightOption, shot } from './helpers.js';

const ADMIN = { first: 'Study', last: 'Office', email: 'sekretariat.dski@heilbronn.dhbw.de' };
const CAMPUS_GARDEN = { latitude: 49.147082, longitude: 9.217206, accuracy: 10 };

test.describe('admin points', () => {
  test('BR41 an admin sees "Reset points" instead of a rank on the map and can reset', async ({
    page,
  }, testInfo) => {
    await login(page, ADMIN);
    await expect(page.getByText(/Rank #/)).toHaveCount(0);
    const reset = page.getByRole('button', { name: 'Reset points' });
    await expect(reset).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '28-admin-reset-points');
    await reset.click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await reset.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reset points' }).click();
    await expect(page.getByText('Points reset')).toBeVisible();
  });

  test('BR41 a student keeps the rank chip and has no reset button', async ({ page }) => {
    await login(page);
    await expect(page.getByText(/Rank #/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset points' })).toHaveCount(0);
  });

  test('BR42 an admin result shows no ranks, a student result with team shows the team rank', async ({
    page,
    context,
  }, testInfo) => {
    await login(page, ADMIN);
    await page.goto('/admin/test-quests');
    await page.getByRole('link', { name: 'Test quiz' }).first().click();
    await expect(page.getByRole('timer')).toBeVisible();
    await page.goBack();
    await page.evaluate(() => sessionStorage.clear());

    await context.setGeolocation(CAMPUS_GARDEN);
    await page.goto('/');
    await login(page);
    await page.goto('/team');
    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByText(/Team score \(average of 2 members, rounded up\)/)).toBeVisible();
    await openCheckpoint(page, 'Campus Garden');
    await page.getByRole('link', { name: 'Start quest' }).click();
    await page.getByRole('button', { name: "I'm ready" }).click();
    await page.getByRole('button', { name: 'I agree' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    for (let i = 0; i < 3; i += 1) {
      await rightOption(page).click();
      await expect(page.getByText('Correct!')).toBeVisible();
      await page.getByRole('button', { name: i === 2 ? 'Finish' : 'Next' }).click();
    }
    await expect(page.getByText('Checkpoint cleared')).toBeVisible();
    await expect(page.getByText(/^Team rank · Campus Crew/)).toBeVisible();
    await expect(page.getByText(/Team score \(average of the members, rounded up\)/)).toBeVisible();
    await page.waitForTimeout(1400);
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '29-result-team-rank');

    await page.goto('/ranks');
    await page.getByRole('tab', { name: /team/i }).click();
    await expect(page.getByText(/Team score = average points of the members/)).toBeVisible();
  });
});
