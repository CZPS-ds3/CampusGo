import { expect } from '@playwright/test';

export const OTP = '123456';

/** Logs a brand-new student in through the screens (mock mode accepts the code 123456). */
export async function login(page, { first = 'Ada', last = 'Lovelace' } = {}) {
  await page.goto('/login');
  await page.getByLabel('School e-mail').fill('ada@heilbronn.dhbw.de');
  await page.getByRole('button', { name: 'Send my code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await page.getByLabel('One-time code, digit 1').click();
  await page.keyboard.insertText(OTP);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByLabel('First name').fill(first);
  await page.getByLabel('Last name').fill(last);
  await page.getByRole('button', { name: 'Start playing' }).click();
  await expect(page.getByRole('heading', { name: 'Campus map' })).toBeVisible();
}

/** The page must never scroll sideways. */
export async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Picks the correct option by the placeholder marker the seed data puts on it. */
export const rightOption = (page) => page.getByRole('button', { name: /placeholder answer/ });
export const wrongOption = (page) =>
  page.locator('.opt').filter({ hasNotText: 'placeholder answer' }).first();

export async function openCheckpoint(page, name) {
  await page
    .locator('.cplist__item')
    .filter({ hasText: new RegExp(name) })
    .click();
}

/** Saves design/screenshots/<viewport>-<name>.png, only when SCREENSHOTS=1 (npm run screenshots). */
export async function shot(page, testInfo, name) {
  if (!process.env.SCREENSHOTS) return;
  await page.screenshot({ path: `../design/screenshots/${testInfo.project.name}-${name}.png` });
}
