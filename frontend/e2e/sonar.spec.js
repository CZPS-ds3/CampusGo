import { expect, test } from '@playwright/test';
import { login, open } from './helpers.js';

// The sonar range ring under the ball (BR12 display, BR48 settings). The browser stands at the Library (see
// playwright.config.js), so the Library is in range.
test.describe('the sonar range ring', () => {
  test('BR12 the ring shows the real unlock range and the Library flashes once as it is in range', async ({
    page,
  }) => {
    await login(page);
    await expect(page.locator('.puck').first()).toBeVisible();
    const sonar = page.locator('.puck-ground .puck-sonar').first();
    await expect(sonar).toBeVisible();
    await expect(sonar.locator('.puck-sonar__wave')).toHaveCount(3);
    // To scale: at least as wide as the ball, set from the map's zoom.
    await expect
      .poll(() => sonar.evaluate((element) => element.getBoundingClientRect().width))
      .toBeGreaterThan(40);
    // The flash leaves its delay on the pin (the flash itself ends by itself).
    const library = page.locator(
      '[title="Library"] .pin, .pin:has(.pin__label:text-is("Library"))',
    );
    await expect
      .poll(() => library.first().evaluate((pin) => pin.style.getPropertyValue('--ping-delay')))
      .toMatch(/^\d+ms$/);
  });

  test('BR48 a student turns the sonar off and the map shows only the ball', async ({ page }) => {
    await login(page);
    await open(page, '/profile');
    const settings = page.getByTestId('map-style');
    await settings.locator('summary').click();
    await settings.getByRole('switch', { name: 'Show the sonar' }).click();
    await expect(settings.getByRole('switch', { name: 'Flash quests in range' })).toBeDisabled();
    await settings.getByRole('button', { name: 'Save map style' }).click();
    await expect(page.getByText('Map style saved')).toBeVisible();
    await open(page, '/map');
    await expect(page.locator('.puck').first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-sonar', 'off');
    await expect(page.locator('.puck-ground .puck-sonar').first()).toBeHidden();
  });
});
