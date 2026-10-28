import { expect } from '@playwright/test';

export const OTP = '123456';

/** Logs a brand-new student in through the screens (mock mode accepts the code 123456). */
export async function login(
  page,
  { first = 'Ada', last = 'Lovelace', email = 'ada@heilbronn.dhbw.de' } = {},
) {
  await page.goto('/login');
  await page.getByLabel('School email').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { name: /6-digit code/ })).toBeVisible();
  await page.getByLabel('Digit 1 of 6').click();
  await page.keyboard.insertText(OTP);
  // The sixth digit logs in by itself; an unknown address then asks for a name.
  await page.getByLabel('First name *').fill(first);
  await page.getByLabel('Last name *').fill(last);
  await page.getByRole('button', { name: 'Enter campus' }).click();
  await expect(page.getByText(/Rank #/)).toBeVisible();
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

/** Opens a checkpoint from the quest list, which shows its sheet on the map. */
export async function openCheckpoint(page, name) {
  await page.goto('/quests');
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** From an open checkpoint sheet to a running quiz: start, read, accept the location notice, unlock. */
export async function startQuiz(page) {
  await page.getByRole('link', { name: /Start quest|Retry quest/ }).click();
  await page.getByRole('button', { name: "I'm ready" }).click();
  await page.getByRole('button', { name: 'I agree' }).click();
  await expect(page.getByText('Locked on!')).toBeVisible();
  await expect(page.getByRole('timer')).toBeVisible();
}

/** Saves design/screenshots/<viewport>-<name>.png, only when SCREENSHOTS=1 (npm run screenshots). */
export async function shot(page, testInfo, name) {
  if (!process.env.SCREENSHOTS) return;
  await page.waitForTimeout(700); // let the red page-change stripe and the entrance animations finish
  await page.screenshot({ path: `../design/screenshots/${testInfo.project.name}-${name}.png` });
}
