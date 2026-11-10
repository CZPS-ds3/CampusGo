import { expect, test } from '@playwright/test';
import { open } from '../e2e/helpers.js';
import { plantCode } from './known-code.js';

test('real stack: sign up with an e-mail code, check in, pass a quiz, appear in the ranking', async ({
  page,
}) => {
  const email = `smoke${Date.now()}@heilbronn.dhbw.de`;

  await page.goto('/login');
  await page.getByLabel('School email').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { name: /6-digit code/ })).toBeVisible();

  const otp = await plantCode(email); // the request above stored a code; the test swaps in a known one

  await page.getByLabel('Digit 1 of 6').click();
  await page.keyboard.insertText(otp);
  await page.getByLabel('First name *').fill('Smoke');
  await page.getByLabel('Last name *').fill('Tester');
  await page.getByRole('button', { name: 'Enter campus' }).click();
  await expect(page.getByRole('link', { name: 'Open profile' })).toBeVisible();

  await open(page, '/quests');
  await page.getByRole('link', { name: /Campus Garden/ }).click();
  await page.getByRole('link', { name: 'Start quest' }).click();
  await expect(page.getByText(/PLACEHOLDER fact 1/)).toBeVisible();
  await page.getByRole('button', { name: "I'm ready" }).click();
  await page.getByRole('button', { name: 'I agree' }).click();
  await expect(page.getByText('Locked on!')).toBeVisible();
  await expect(page.getByRole('timer')).toBeVisible();

  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: /placeholder answer/ }).click();
    await expect(page.getByText('Correct!')).toBeVisible();
    await page.getByRole('button', { name: i === 2 ? 'Finish' : 'Next' }).click();
  }
  await expect(page.getByText('Checkpoint cleared')).toBeVisible();

  await open(page, '/ranks');
  // With demo players in the database the new player is a row of the list; without them it is the "you" card.
  await expect(page.getByText('Smoke T.').first()).toBeVisible();
});

test('real stack: the pre-seeded admin signs in without a sign-up form and tests a quiz from anywhere', async ({
  page,
  context,
}) => {
  await context.setGeolocation({ latitude: 48.0, longitude: 9.0, accuracy: 10 });
  const email = 'sekretariat.dski@heilbronn.dhbw.de';
  await page.goto('/login');
  await page.getByLabel('School email').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { name: /6-digit code/ })).toBeVisible();
  const otp = await plantCode(email);
  await page.getByLabel('Digit 1 of 6').click();
  await page.keyboard.insertText(otp);
  await expect(page.getByRole('link', { name: 'Open profile' })).toBeVisible();

  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('menuitem').first()).toContainText('Admin');
  await page.keyboard.press('Escape');

  await open(page, '/admin');
  await expect(page.getByRole('heading', { name: 'Logins and quests per day' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Top players' })).toBeVisible();

  await open(page, '/admin/test-quests');
  await page.getByRole('link', { name: 'Test quiz' }).first().click();
  await expect(page.getByRole('timer')).toBeVisible();
});
