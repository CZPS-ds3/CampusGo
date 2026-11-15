import { readFileSync } from 'node:fs';
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
  // Students see a rank chip, administrators a reset button: the profile link is on the map for both.
  await expect(page.getByRole('link', { name: 'Open profile' })).toBeVisible();
}

/**
 * Picks the view the map starts with in the preferences and opens the map. A new account starts in 3D or 2D
 * depending on the device, so tests that need one choose it.
 */
export async function chooseMapView(page, view) {
  await open(page, '/profile');
  await page
    .getByTestId('map-type')
    .getByRole('radio', { name: view === '3d' ? '3D' : '2D', exact: true })
    .click();
  await page.goto('/map');
}

/** The page must never scroll sideways. */
/**
 * Opens a page inside the running app, like a tap in the menu. A fresh page load (page.goto) always starts on the map,
 * so tests reach other pages this way.
 */
export async function open(page, path) {
  if (!page.url().startsWith('http')) {
    await page.goto('/map');
    // The app first checks the session and then lands on the map or the login page; a page pushed before that
    // landing was overwritten by it now and then.
    await expect(page.locator('h1').first()).toBeAttached();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  }
  await page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

export async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

// The mock serves the team's question bank (src/api/question-bank.json), so the right answers are looked up there.
const BANK = Object.values(
  JSON.parse(readFileSync(new URL('../src/api/question-bank.json', import.meta.url), 'utf8')).bank,
).flat();

/**
 * The bank question on screen. The text alone is not enough (Building B and C ask the same top-up question with
 * different options), so the options must match as well.
 */
async function questionOnScreen(page) {
  const text = (await page.locator('.quiz__question').innerText()).trim();
  const options = (await page.locator('.opt__text').allInnerTexts()).map((o) => o.trim());
  const question = BANK.find(
    (q) => q.text === text && q.options.every((option, i) => option === options[i]),
  );
  if (!question) throw new Error(`The question on screen is not in the bank: ${text}`);
  return question;
}

const optionButton = (page, text) =>
  page.locator('.opt').filter({ has: page.locator('.opt__text').getByText(text, { exact: true }) });

/** Ticks the given options of the question on screen; a multi-select one is then checked with its button. */
async function pick(page, question, positions) {
  for (const position of positions) await optionButton(page, question.options[position]).click();
  if (question.right.length > 1) await page.getByRole('button', { name: 'Check answer' }).click();
}

/** Answers the question on screen right (one option, or all right ones of a multi-select question). */
export async function answerRight(page) {
  const question = await questionOnScreen(page);
  await pick(page, question, question.right);
}

/** Answers the question on screen wrong (a wrong option). */
export async function answerWrong(page) {
  const question = await questionOnScreen(page);
  const wrong = [0, 1, 2, 3].find((position) => !question.right.includes(position));
  await pick(page, question, [wrong]);
}

/** Opens a checkpoint from the quest list, which shows its sheet on the map. */
export async function openCheckpoint(page, name) {
  await open(page, '/quests');
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/**
 * The first location check of a test can be slow on a cold browser (small phone sizes, a busy machine): the
 * geolocation reading and the check both run before "Locked on!" (or "Weak signal" after the 8 s measuring window), so
 * it gets more time than other steps.
 */
export const LOCK_ON_TIMEOUT = 25_000;

/** After the unlock: the 3-2-1 countdown (R-66), then the first question with the running timer. */
export async function passCountdown(page) {
  await expect(page.getByTestId('quiz-countdown')).toBeVisible({ timeout: LOCK_ON_TIMEOUT });
  await expect(page.locator('.quiz__question')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('timer')).toBeVisible();
}

/** From an open checkpoint sheet to a running quiz: start, read, accept the location notice, unlock, countdown. */
export async function startQuiz(page) {
  await page.getByRole('link', { name: /Start quest|Retry quest/ }).click();
  await page.getByRole('button', { name: "I'm ready" }).click();
  await page.getByRole('button', { name: 'I agree' }).click();
  await expect(page.getByText('Locked on!')).toBeVisible({ timeout: LOCK_ON_TIMEOUT });
  await passCountdown(page);
}

/** Saves design/screenshots/<viewport>-<name>.png, only when SCREENSHOTS=1 (npm run screenshots). */
export async function shot(page, testInfo, name) {
  if (!process.env.SCREENSHOTS) return;
  await page.waitForTimeout(700); // let the red page-change stripe and the entrance animations finish
  await page.screenshot({ path: `../design/screenshots/${testInfo.project.name}-${name}.png` });
}
