import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, shot, login, openCheckpoint, rightOption } from './helpers.js';

const LIBRARY = { latitude: 49.1236, longitude: 9.2119, accuracy: 10 };

async function startLibrary(page, context) {
  await login(page);
  await context.setGeolocation(LIBRARY);
  await openCheckpoint(page, 'Library');
  await page.getByRole('button', { name: /Check my location/ }).click();
  await page.getByRole('button', { name: 'I agree' }).click();
  await page.getByRole('button', { name: 'Start the quiz' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
}

test.describe('quiz states', () => {
  test('hard question offer after four right answers, only a deliberate tap takes it', async ({
    page,
    context,
  }, testInfo) => {
    await startLibrary(page, context);
    for (let i = 0; i < 4; i += 1) {
      await rightOption(page).click();
      await page.getByRole('button', { name: 'Next' }).click();
    }
    const sheet = page.getByRole('dialog', { name: /choose your path/i });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(/You cannot switch back/)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '15-hard-offer');

    // Escape must not dismiss it: the choice has to be made.
    await page.keyboard.press('Escape');
    await expect(sheet).toBeVisible();

    await sheet.getByRole('button', { name: 'Hard question' }).click();
    await expect(sheet.getByRole('button', { name: 'Go hard' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Go hard' }).click();
    await expect(page.getByText('HARD · 2,000')).toBeVisible();
  });

  test('declining the hard question continues with a normal fifth question', async ({
    page,
    context,
  }) => {
    await startLibrary(page, context);
    for (let i = 0; i < 4; i += 1) {
      await rightOption(page).click();
      await page.getByRole('button', { name: 'Next' }).click();
    }
    await page.getByRole('button', { name: /1,000/ }).click();
    await expect(page.getByLabel('Question 5 of 5')).toBeVisible();
    await expect(page.getByText('HARD · 2,000')).toHaveCount(0);
  });

  test('the last 30 seconds look urgent and time running out ends the quiz', async ({
    page,
    context,
  }, testInfo) => {
    await page.clock.install();
    await startLibrary(page, context);
    await page.clock.fastForward(271_000);
    await expect(page.locator('.timer.is-urgent')).toBeVisible();
    await expect(page.getByText('HURRY')).toBeVisible();
    await shot(page, testInfo, '16-urgent');

    await page.clock.fastForward(40_000);
    const layer = page.getByRole('alertdialog', { name: 'Time is up' });
    await expect(layer).toBeVisible();
    await shot(page, testInfo, '17-expired');
    await layer.getByRole('button', { name: 'See result' }).click();
    await expect(page.getByRole('heading', { name: 'Time ran out' })).toBeVisible();
    await shot(page, testInfo, '18-result-failed');
  });
});
