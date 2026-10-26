import { expect, test } from '@playwright/test';

test('real stack: sign up with an e-mail code, check in, pass a quiz, appear in the ranking', async ({
  page,
}) => {
  const email = `smoke${Date.now()}@heilbronn.dhbw.de`;

  await page.goto('/login');
  await page.getByLabel('School e-mail').fill(email);
  await page.getByRole('button', { name: 'Send my code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();

  // The backend prints the mail in development; the dev-only route hands the code to the test.
  let otp;
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/dev/last-otp?email=${encodeURIComponent(email)}`);
        if (!res.ok()) return null;
        otp = (await res.json()).otp;
        return otp;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();

  await page.getByLabel('One-time code, digit 1').click();
  await page.keyboard.insertText(otp);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByLabel('First name').fill('Smoke');
  await page.getByLabel('Last name').fill('Tester');
  await page.getByRole('button', { name: 'Start playing' }).click();
  await expect(page.getByRole('heading', { name: 'Campus map' })).toBeVisible();

  await page.locator('.cplist__item').filter({ hasText: 'Containers' }).click();
  await page.getByRole('button', { name: /Check my location/ }).click();
  await page.getByRole('button', { name: 'I agree' }).click();
  await expect(page.getByText('You are at the checkpoint.')).toBeVisible();
  await page.getByRole('button', { name: 'Start the quiz' }).click();
  await expect(page.getByRole('timer')).toBeVisible();

  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: /placeholder answer/ }).click();
    await expect(page.getByText('Correct!')).toBeVisible();
    await page.getByRole('button', { name: i === 2 ? 'See result' : 'Next' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Passed' })).toBeVisible();

  await page.getByRole('link', { name: 'See the ranking' }).click();
  await expect(page.locator('.board__row.is-you')).toBeVisible();
});
