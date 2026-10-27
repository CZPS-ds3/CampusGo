import { expect, test } from '@playwright/test';
import {
  expectNoHorizontalScroll,
  login,
  openCheckpoint,
  rightOption,
  shot,
  startQuiz,
} from './helpers.js';

const LIBRARY = { latitude: 49.1236, longitude: 9.2119, accuracy: 10 };
const CONTAINERS = { latitude: 49.1221, longitude: 9.2121, accuracy: 10 };

test.describe('full player journey (mock API)', () => {
  test('login, check in, read, pass a quiz, see the ranking', async ({
    page,
    context,
  }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Campus/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '01-splash');

    await page.getByRole('link', { name: 'Start' }).click();
    await expect(page.getByRole('heading', { name: /Log in to/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '02-login');

    await login(page);
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '03-map');

    await context.setGeolocation(CONTAINERS);
    await openCheckpoint(page, 'Containers');
    await shot(page, testInfo, '04-checkpoint-sheet');
    await page.getByRole('link', { name: 'Start quest' }).click();
    await page.getByRole('button', { name: 'I agree' }).click();
    await expect(page.getByText('Locked on!')).toBeVisible();
    await shot(page, testInfo, '05-locked-on');

    await expect(page.getByRole('heading', { name: 'Containers' })).toBeVisible();
    await expect(page.getByText('Read these first. No timer is running yet.')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '06-info');

    await page.getByRole('button', { name: "I'm ready" }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '07-quiz');

    for (let i = 0; i < 3; i += 1) {
      await rightOption(page).click();
      await expect(page.getByText('Correct!')).toBeVisible();
      if (i === 0) await shot(page, testInfo, '08-correct');
      await page.getByRole('button', { name: i === 2 ? 'Finish' : 'Next' }).click();
    }

    await expect(page.getByText('Checkpoint cleared')).toBeVisible();
    await expect(page.getByText('Points earned')).toBeVisible();
    await page.waitForTimeout(1400); // let the score count up
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '09-result');

    await page.goto('/ranks');
    await expect(page.getByRole('heading', { name: 'Ranks' })).toBeVisible();
    await expect(page.locator('.ranks__you')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '10-ranks');
  });

  test('a wrong answer reveals the right one and cannot be retried', async ({ page, context }) => {
    await login(page);
    await context.setGeolocation(LIBRARY);
    await openCheckpoint(page, 'Library');
    await startQuiz(page);

    await page.locator('.opt').filter({ hasNotText: 'placeholder answer' }).first().click();
    await expect(page.getByText(/Not quite/)).toBeVisible();
    await expect(page.locator('.opt.is-correct')).toHaveCount(1);
    await expect(page.locator('.opt.is-wrong')).toHaveCount(1);
    await expect(page.locator('.opt[aria-disabled="true"]')).toHaveCount(4);
  });

  test('a refresh in the middle of the quiz keeps the same attempt', async ({ page, context }) => {
    await login(page);
    await context.setGeolocation(LIBRARY);
    await openCheckpoint(page, 'Library');
    await startQuiz(page);
    const question = await page.locator('.quiz__question').innerText();
    await rightOption(page).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.reload();
    await expect(page.getByLabel('Question 2 of 5')).toBeVisible();
    expect(await page.locator('.quiz__question').innerText()).not.toBe(question);
  });
});

test.describe('location problems never use an attempt', () => {
  test('poor accuracy asks to check again', async ({ page, context }) => {
    await login(page);
    await context.setGeolocation({ ...LIBRARY, accuracy: 200 });
    await openCheckpoint(page, 'Library');
    await page.getByRole('link', { name: 'Start quest' }).click();
    await page.getByRole('button', { name: 'I agree' }).click();
    await expect(page.getByText('Weak signal')).toBeVisible();
    await expect(page.getByText(/No attempt used/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('being far away is reported without starting anything', async ({ page, context }) => {
    await login(page);
    await context.setGeolocation({ latitude: 49.14, longitude: 9.25, accuracy: 10 });
    await openCheckpoint(page, 'Library');
    await page.getByRole('link', { name: 'Start quest' }).click();
    await page.getByRole('button', { name: 'I agree' }).click();
    await expect(page.getByText('Not there yet')).toBeVisible();
  });
});

test('pages behind the login send a visitor to the login screen', async ({ page }) => {
  await page.goto('/ranks');
  await expect(page.getByRole('heading', { name: /Log in to/ })).toBeVisible();
});

test('an unknown address shows the out-of-bounds page', async ({ page }) => {
  await page.goto('/nowhere');
  await expect(page.getByRole('heading', { name: 'Out of bounds' })).toBeVisible();
});
