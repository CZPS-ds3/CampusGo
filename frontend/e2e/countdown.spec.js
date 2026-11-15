import { expect, test } from '@playwright/test';
import { answerRight, LOCK_ON_TIMEOUT, login, openCheckpoint } from './helpers.js';

const CAMPUS_GARDEN = { latitude: 49.147082, longitude: 9.217206, accuracy: 10 };

test.describe('R-66 the 3-2-1 countdown after the location check', () => {
  test('R-66 BR13 a countdown shows before the first question, and the full time starts after it', async ({
    page,
    context,
  }) => {
    await login(page);
    await context.setGeolocation(CAMPUS_GARDEN);
    await openCheckpoint(page, 'Campus Garden');
    await page.getByRole('link', { name: 'Start quest' }).click();
    // BR09: the read-first page holds the facts that answer the questions, no placeholder text.
    await expect(page.getByText(/The Campus Garden is in Building 1/)).toBeVisible();
    await expect(page.getByText(/PLACEHOLDER/)).toHaveCount(0);
    await page.getByRole('button', { name: "I'm ready" }).click();
    await page.getByRole('button', { name: 'I agree' }).click();

    const countdown = page.getByTestId('quiz-countdown');
    await expect(countdown).toBeVisible({ timeout: LOCK_ON_TIMEOUT });
    await expect(countdown.getByText('Locked on!')).toBeVisible();
    await expect(countdown.getByRole('status')).toHaveText(/^[123]$/);
    // No question and no running timer during the countdown.
    await expect(page.locator('.quiz__question')).toHaveCount(0);
    await expect(page.getByRole('timer')).toHaveCount(0);

    await expect(page.locator('.quiz__question')).toBeVisible({ timeout: 10_000 });
    // The countdown cost no quiz time: 3 questions, 3:00, a moment after the start still 2:5x or 3:00.
    await expect(page.getByRole('timer')).toHaveText(/^(3:00|2:5\d)$/);
    await answerRight(page);
    await expect(page.getByText('Correct!')).toBeVisible();
  });

  test('R-66 a refresh during the countdown keeps counting and then shows the questions', async ({
    page,
    context,
  }) => {
    await login(page);
    await context.setGeolocation(CAMPUS_GARDEN);
    await openCheckpoint(page, 'Campus Garden');
    await page.getByRole('link', { name: 'Start quest' }).click();
    await page.getByRole('button', { name: "I'm ready" }).click();
    await page.getByRole('button', { name: 'I agree' }).click();
    await expect(page.getByTestId('quiz-countdown')).toBeVisible({ timeout: LOCK_ON_TIMEOUT });
    await page.reload();
    await expect(page.locator('.quiz__question')).toBeVisible({ timeout: 10_000 });
  });
});
