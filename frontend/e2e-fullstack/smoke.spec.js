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

  await page.goto('/ranks');
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
  await expect(page.getByText(/Rank #/)).toBeVisible();

  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('menuitem').first()).toContainText('Admin');
  await page.keyboard.press('Escape');

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Logins and quests per day' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Top players' })).toBeVisible();

  await page.goto('/admin/test-quests');
  await page.getByRole('link', { name: 'Test quiz' }).first().click();
  await expect(page.getByRole('timer')).toBeVisible();
});
