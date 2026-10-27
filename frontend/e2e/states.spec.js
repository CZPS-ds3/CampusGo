import { expect, test } from '@playwright/test';
import {
  expectNoHorizontalScroll,
  login,
  openCheckpoint,
  rightOption,
  shot,
  startQuiz,
} from './helpers.js';

const LIBRARY = { latitude: 49.149493, longitude: 9.216467, accuracy: 10 };

async function startLibrary(page, context) {
  await login(page);
  await context.setGeolocation(LIBRARY);
  await openCheckpoint(page, 'Library');
  await startQuiz(page);
}

async function answerFourRight(page) {
  for (let i = 0; i < 4; i += 1) {
    await rightOption(page).click();
    await page.getByRole('button', { name: 'Next' }).click();
  }
}

test.describe('quiz states', () => {
  test('hard question offer after four right answers, only a deliberate tap takes it', async ({
    page,
    context,
  }, testInfo) => {
    await startLibrary(page, context);
    await answerFourRight(page);
    await expect(page.getByRole('heading', { name: /Bonus\s*round/ })).toBeVisible();
    await expect(page.getByText(/You cannot switch back/)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '17-bonus-offer');

    await page.getByRole('button', { name: 'Accept bonus' }).click();
    await expect(page.getByText('Bonus · worth 2,000')).toBeVisible();
  });

  test('declining the hard question continues with a normal fifth question', async ({
    page,
    context,
  }) => {
    await startLibrary(page, context);
    await answerFourRight(page);
    await page.getByRole('button', { name: 'Decline, normal Q5' }).click();
    await expect(page.getByLabel('Question 5 of 5')).toBeVisible();
    await expect(page.getByText('Bonus · worth 2,000')).toHaveCount(0);
  });

  test('the last 30 seconds look urgent and time running out ends the quiz', async ({
    page,
    context,
  }, testInfo) => {
    await page.clock.install();
    await startLibrary(page, context);
    await page.clock.fastForward(271_000);
    await expect(page.locator('.timer.is-urgent')).toBeVisible();
    await shot(page, testInfo, '18-urgent');

    await page.clock.fastForward(40_000);
    const layer = page.getByRole('alertdialog', { name: 'Time is up' });
    await expect(layer).toBeVisible();
    await shot(page, testInfo, '19-expired');
    await layer.getByRole('button', { name: 'See result' }).click();
    await expect(page.getByText('Almost there')).toBeVisible();
    await expect(page.getByText('Next attempt pays')).toBeVisible();
    await shot(page, testInfo, '20-result-failed');
  });
});
