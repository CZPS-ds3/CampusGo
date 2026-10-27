import { expect, test } from '@playwright/test';

test('real stack: sign up with an e-mail code, check in, pass a quiz, appear in the ranking', async ({
  page,
}) => {
  const email = `smoke${Date.now()}@heilbronn.dhbw.de`;

  await page.goto('/login');
  await page.getByLabel('School email').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { name: /6-digit code/ })).toBeVisible();

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

  await page.getByLabel('Digit 1 of 6').click();
  await page.keyboard.insertText(otp);
  await page.getByLabel('First name *').fill('Smoke');
  await page.getByLabel('Last name *').fill('Tester');
  await page.getByRole('button', { name: 'Enter campus' }).click();
  await expect(page.getByText(/Rank #/)).toBeVisible();

  await page.goto('/quests');
  await page.getByRole('link', { name: /Containers/ }).click();
  await page.getByRole('link', { name: 'Start quest' }).click();
  await page.getByRole('button', { name: 'I agree' }).click();
  await expect(page.getByText('Locked on!')).toBeVisible();
  await expect(page.getByText(/PLACEHOLDER fact 1/)).toBeVisible();
  await page.getByRole('button', { name: "I'm ready" }).click();
  await expect(page.getByRole('timer')).toBeVisible();

  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: /placeholder answer/ }).click();
    await expect(page.getByText('Correct!')).toBeVisible();
    await page.getByRole('button', { name: i === 2 ? 'Finish' : 'Next' }).click();
  }
  await expect(page.getByText('Checkpoint cleared')).toBeVisible();

  await page.goto('/ranks');
  await expect(page.locator('.ranks__you')).toBeVisible();
});
