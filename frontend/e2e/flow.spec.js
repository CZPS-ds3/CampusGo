import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, shot, login, openCheckpoint, rightOption } from './helpers.js';

async function startQuizAt(page, context, place, name) {
  await context.setGeolocation(place);
  await openCheckpoint(page, name);
  await page.getByRole('button', { name: /Check my location/ }).click();
  await page.getByRole('button', { name: 'I agree' }).click();
}

const LIBRARY = { latitude: 49.1236, longitude: 9.2119, accuracy: 10 };
const CONTAINERS = { latitude: 49.1221, longitude: 9.2121, accuracy: 10 };

test.describe('full player journey (mock API)', () => {
  test('login, check in, pass a quiz, see the ranking', async ({ page, context }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Campus & City Quest' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '01-splash');

    await page.getByRole('link', { name: 'Start the quest' }).click();
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '02-login');

    await login(page);
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '03-map');

    await startQuizAt(page, context, CONTAINERS, 'Containers');
    await expect(page.getByText('You are at the checkpoint.')).toBeVisible();
    await shot(page, testInfo, '04-verified');

    await page.getByRole('button', { name: 'Start the quiz' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '05-quiz');

    for (let i = 0; i < 3; i += 1) {
      await rightOption(page).click();
      await expect(page.getByText('Correct!')).toBeVisible();
      if (i === 0) await shot(page, testInfo, '06-correct');
      await page.getByRole('button', { name: i === 2 ? 'See result' : 'Next' }).click();
    }

    await expect(page.getByRole('heading', { name: 'Passed' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '07-result');

    await page.getByRole('link', { name: 'See the ranking' }).click();
    await expect(page.getByRole('heading', { name: 'Ranks' })).toBeVisible();
    await expect(page.locator('.board__row.is-you')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, '08-ranks');
  });

  test('a wrong answer reveals the right one and cannot be retried', async ({ page, context }) => {
    await login(page);
    await startQuizAt(page, context, LIBRARY, 'Library');
    await page.getByRole('button', { name: 'Start the quiz' }).click();

    await page.locator('.opt').filter({ hasNotText: 'placeholder answer' }).first().click();
    await expect(page.getByText(/Not quite/)).toBeVisible();
    await expect(page.locator('.opt.is-correct')).toHaveCount(1);
    await expect(page.locator('.opt.is-wrong')).toHaveCount(1);
    await expect(page.locator('.opt[aria-disabled="true"]')).toHaveCount(4);
  });

  test('a refresh in the middle of the quiz keeps the same attempt', async ({ page, context }) => {
    await login(page);
    await startQuizAt(page, context, LIBRARY, 'Library');
    await page.getByRole('button', { name: 'Start the quiz' }).click();
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
    await startQuizAt(page, context, { ...LIBRARY, accuracy: 200 }, 'Library');
    await expect(
      page.getByRole('alert').filter({ hasText: 'did not use an attempt' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Check my location/ })).toBeVisible();
  });

  test('being far away is reported without starting anything', async ({ page, context }) => {
    await login(page);
    await startQuizAt(page, context, { latitude: 49.14, longitude: 9.25, accuracy: 10 }, 'Library');
    await expect(page.getByText(/not at this checkpoint yet/)).toBeVisible();
  });
});

test('pages behind the login send a visitor to the login screen', async ({ page }) => {
  await page.goto('/ranks');
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
});
