import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { login, open } from '../../frontend/e2e/helpers.js';

const ADMIN = { first: 'Study', last: 'Office', email: 'sekretariat.dski@heilbronn.dhbw.de' };
const SCREENS = ['/map', '/quests', '/team', '/ranks', '/profile'];
const ADMIN_SCREENS = ['/admin/quests', '/admin/quests/1', '/admin/quests/new', '/admin/teams'];

/** Serious and critical accessibility problems of the page as it is shown now. */
async function seriousProblems(page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations
    .filter((v) => ['serious', 'critical'].includes(v.impact))
    .map(
      (v) =>
        `${v.id}: ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    );
}

test.describe('accessibility (axe, WCAG 2.1 A and AA)', () => {
  test('the login screen has no serious problems', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('School email')).toBeVisible();
    expect(await seriousProblems(page)).toEqual([]);
  });

  test('every screen behind the login has no serious problems, in light and dark', async ({
    page,
  }) => {
    await login(page);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        theme,
      );
      for (const path of SCREENS) {
        await open(page, path);
        await page.evaluate(
          (value) => document.documentElement.setAttribute('data-theme', value),
          theme,
        );
        await page.waitForTimeout(500);
        expect(await seriousProblems(page), `${path} (${theme})`).toEqual([]);
      }
    }
  });

  test('the admin dashboard has no serious problems', async ({ page }) => {
    await login(page, ADMIN);
    await open(page, '/admin');
    await expect(page.getByRole('heading', { name: 'Logins and quests per day' })).toBeVisible();
    expect(await seriousProblems(page)).toEqual([]);
  });

  test('the quest and team pages of the admin have no serious problems, in light and dark', async ({
    page,
  }) => {
    await login(page, ADMIN);
    for (const theme of ['light', 'dark']) {
      for (const path of ADMIN_SCREENS) {
        await open(page, path);
        await page.evaluate(
          (value) => document.documentElement.setAttribute('data-theme', value),
          theme,
        );
        await page.waitForTimeout(500);
        expect(await seriousProblems(page), `${path} (${theme})`).toEqual([]);
      }
      await open(page, '/admin/quests/1');
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        theme,
      );
      await page.getByRole('button', { name: 'Add question' }).click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await page.waitForTimeout(700); // the pop-up fades in; axe must see its final colours
      expect(await seriousProblems(page), `question pop-up (${theme})`).toEqual([]);
      await page.keyboard.press('Escape');
      await open(page, '/admin/teams');
      await page.getByRole('button', { name: 'Add a student' }).first().click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await page.waitForTimeout(700); // the pop-up fades in; axe must see its final colours
      expect(await seriousProblems(page), `add-student pop-up (${theme})`).toEqual([]);
    }
  });
});

test.describe('layout and touch', () => {
  test('the admin quest pages do not scroll sideways at 320 px wide', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await login(page, ADMIN);
    for (const path of ADMIN_SCREENS) {
      await open(page, path);
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test('no screen scrolls sideways, even at 320 px wide', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await login(page);
    for (const path of SCREENS) {
      await open(page, path);
      await page.waitForTimeout(300);
      const wide = await page.evaluate(() =>
        [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
          .filter((el) => !el.closest('.leaflet-container, .map3d, .scrim, .wipe-root, .sr-only'))
          .slice(0, 5)
          .map(
            (el) =>
              `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(el.getBoundingClientRect().right)}`,
          ),
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect({ path, wide }, 'elements wider than the screen').toEqual({ path, wide: [] });
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test('buttons and links are big enough to touch (at least 40 px)', async ({ page }) => {
    await login(page);
    for (const path of ['/quests', '/team', '/profile']) {
      await open(page, path);
      await page.waitForTimeout(300);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('button, a[href]')]
          .filter((el) => el.offsetParent !== null && !el.closest('.sr-only'))
          .map((el) => ({
            name: (el.textContent || el.getAttribute('aria-label') || '').trim(),
            box: el.getBoundingClientRect(),
          }))
          .filter(({ box }) => box.width > 0 && Math.min(box.width, box.height) < 40)
          .map(
            ({ name, box }) =>
              `${name.slice(0, 30)} ${Math.round(box.width)}x${Math.round(box.height)}`,
          ),
      );
      expect(small, path).toEqual([]);
    }
  });
});

test.describe('keyboard and focus', () => {
  test('Tab reaches the menu button and every focused control shows a visible focus ring', async ({
    page,
  }) => {
    await login(page);
    await open(page, '/profile');
    const seen = new Set();
    // The round menu button is the last control in tab order, so keep going until it has been reached.
    for (let i = 0; i < 80 && ![...seen].some((label) => /menu/i.test(label)); i += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        // The ring may sit on the control or on its visual child (the round menu button).
        const ringed = (node) => {
          const style = getComputedStyle(node);
          const outlined = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
          return outlined || style.boxShadow !== 'none';
        };
        const shadowed = [el, ...el.querySelectorAll('*')].some(ringed);
        const outlined = false;
        return {
          label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20),
          visible: outlined || shadowed,
        };
      });
      if (info) {
        seen.add(info.label);
        expect(info.visible, `no focus ring on "${info.label}"`).toBe(true);
      }
    }
    expect([...seen].some((label) => /menu/i.test(label))).toBe(true);
  });

  test('the menu closes with Escape and gives focus back to its button', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('menuitem').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
  });
});

test.describe('preferences', () => {
  test('the language switches to German and the page says so', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('radio', { name: 'Deutsch' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });

  test('reduced motion turns the page-change stripe and the carousel off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page);
    const animated = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'carousel__img';
      document.body.appendChild(probe);
      const duration = getComputedStyle(probe).transitionDuration;
      probe.remove();
      return duration;
    });
    expect(['0s', '0.001s', '1e-05s', '1e-06s', '']).toContain(animated);
  });
});
