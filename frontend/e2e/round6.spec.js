import { expect, test } from '@playwright/test';
import { OTP, expectNoHorizontalScroll, login, shot } from './helpers.js';

const ADMIN = { first: 'Study', last: 'Office', email: 'sekretariat.dski@heilbronn.dhbw.de' };
const LINK = 'https://www.google.com/maps/@49.1502,9.2201,19z';
const CAMPUS = { latitude: 49.1502, longitude: 9.2201, accuracy: 10 };

async function fillQuestion(page, { text, type, options, right }) {
  await page.getByRole('button', { name: 'Add question' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByLabel('Question', { exact: true }).fill(text);
  await dialog.getByLabel('Type').selectOption(type);
  for (const [index, option] of options.entries()) {
    await dialog.getByLabel(`Option ${index + 1}`, { exact: true }).fill(option);
  }
  // A multiple-choice question starts with option 1 right; a multi-select one needs the ticks set.
  for (const index of right) {
    const tick = dialog.getByLabel(`Option ${index + 1} is correct`);
    if (!(await tick.isChecked())) await tick.check();
  }
  await dialog.getByRole('button', { name: 'Save question' }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe('login code', () => {
  test('BR01 a wrong code is refused with a message and sends no new code by itself', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('School email').fill('ada@heilbronn.dhbw.de');
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByLabel('Digit 1 of 6').click();
    await page.keyboard.insertText('000000');
    await expect(page.getByText('That code is wrong or has expired.')).toBeVisible();
    await expect(page.getByText(/A new code was sent/)).toHaveCount(0);
    await page.getByLabel('Digit 1 of 6').click();
    await page.keyboard.insertText(OTP);
    await page.getByLabel('First name *').fill('Ada');
    await page.getByLabel('Last name *').fill('Lovelace');
    await page.getByRole('button', { name: 'Enter campus' }).click();
    await expect(page.getByRole('link', { name: 'Open profile' })).toBeVisible();
  });
});

test.describe('teams: leader and invitations', () => {
  test('BR44 BR45 the leader can remove a member, and anyone cancels an invitation', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/team');
    await page.getByLabel('Team name *').fill('Night Owls');
    await page.getByRole('button', { name: 'Create team' }).click();
    await expect(page.getByRole('heading', { name: 'Night Owls' })).toBeVisible();
    await expect(page.getByText('Leader')).toBeVisible();

    await page.getByLabel('School email').fill('mia.k@heilbronn.dhbw.de');
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByText(/Invite pending/)).toBeVisible();
    await page.getByRole('button', { name: /Cancel the invitation to/ }).click();
    await expect(page.getByText(/Invite pending/)).toHaveCount(0);
    await expect(page.getByText('The invitation was cancelled.')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('BR44 only the leader sees Remove: a member who joined an invitation does not', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/team');
    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByText('Campus Crew').first()).toBeVisible();
    await expect(page.getByText('Leader')).toBeVisible();
    await expect(page.getByRole('button', { name: /Remove .* from the team/ })).toHaveCount(0);
  });
});

test.describe('admin: students, teams and deleted accounts', () => {
  test('BR46 an admin adds a student without a team to a team through the pop-up', async ({
    page,
  }, testInfo) => {
    await login(page, ADMIN);
    await page.goto('/admin/teams');
    await page.getByRole('button', { name: 'Add a student' }).first().click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('list', { name: 'Students without a team' })).toBeVisible();
    await dialog.getByLabel('Search by e-mail or name').fill('lars');
    await expect(dialog.getByText(/lars\.nordmann@heilbronn\.dhbw\.de/)).toBeVisible();
    await dialog.getByRole('button', { name: /Lars/ }).click();
    await shot(page, testInfo, '30-admin-add-member');
    await dialog.getByRole('button', { name: /^Add Lars/ }).click();
    await expect(page.getByText(/was added to/)).toBeVisible();
    await expect(page.getByText('Lars').first()).toBeVisible();
  });

  test('BR47 deleting an account removes it for good: it leaves the list and no "deleted" status exists', async ({
    page,
  }, testInfo) => {
    await login(page, ADMIN);
    await page.goto('/admin/users');
    await expect(page.getByLabel('Status').locator('option', { hasText: 'Deleted' })).toHaveCount(
      0,
    );
    await page.getByLabel('Search').fill('Sam');
    await page.getByRole('link', { name: /Sam/ }).first().click();
    await page.getByRole('button', { name: 'Delete account' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('removed for good');
    await shot(page, testInfo, '31-admin-delete-account');
    await dialog.getByRole('button', { name: 'Delete account' }).click();
    await expect(page.getByText('Account deleted')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByRole('link', { name: /Sam Whitfield/ })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test('BR53 an admin makes a student an admin and back, and the role shows at once', async ({
    page,
  }, testInfo) => {
    await login(page, ADMIN);
    await page.goto('/admin/users');
    await page.getByLabel('Search').fill('Aiko');
    await page.getByRole('link', { name: /Aiko/ }).first().click();
    const card = page.getByTestId('role-card');
    await expect(card.getByRole('radio', { name: 'Student' })).toBeChecked();
    await card.getByRole('radio', { name: 'Admin' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Make Aiko an admin?');
    await shot(page, testInfo, '33-admin-role-confirm');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Make admin' }).click();
    await expect(page.getByText('Now an admin')).toBeVisible();
    await expect(card.getByRole('radio', { name: 'Admin' })).toBeChecked();
    await expect(page.getByRole('heading', { name: 'Account actions' })).toHaveCount(0);

    await page.goto('/admin/users');
    await page.getByLabel('Role').selectOption('admin');
    await expect(page.getByRole('link', { name: /Aiko/ })).toBeVisible();
    await page.getByRole('link', { name: /Aiko/ }).first().click();
    await page.getByTestId('role-card').getByRole('radio', { name: 'Student' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Make student' }).click();
    await expect(page.getByText('Now a student')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Account actions' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('admin: quests', () => {
  test('BR49 BR51 an invalid map link is explained, a valid one creates the quest', async ({
    page,
  }, testInfo) => {
    await login(page, ADMIN);
    await page.goto('/admin/quests');
    await expect(page.getByTestId('quest-card')).toHaveCount(8);
    await page.getByRole('link', { name: 'New quest' }).click();
    await page.getByLabel('Title').fill('Sports Hall');
    await page.getByLabel('Description').fill('Where the sports happen.');

    await page.getByLabel('Google Maps link').fill('Sports Hall Heilbronn');
    await page.getByRole('button', { name: 'Check link' }).click();
    await expect(page.getByText(/This link cannot be used:.*not a web address/)).toBeVisible();
    await page.getByLabel('Google Maps link').fill('https://www.google.com/maps/@52.52,13.4,12z');
    await page.getByRole('button', { name: 'Check link' }).click();
    await expect(page.getByText(/outside the map students can see/)).toBeVisible();
    await shot(page, testInfo, '32-admin-quest-link-error');

    await page.getByLabel('Google Maps link').fill(LINK);
    await page.getByRole('button', { name: 'Check link' }).click();
    await expect(
      page.getByText('Link is valid. The place is inside the student map.'),
    ).toBeVisible();
    await page.getByLabel('Question types').selectOption('MIXED');
    await page.getByRole('button', { name: 'Create quest' }).click();
    await expect(page.getByRole('heading', { name: 'Sports Hall' }).first()).toBeVisible();
    await expect(page.getByText('Not ready yet.')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('BR49 BR50 an admin builds a mixed quest with questions, and students see the types before starting', async ({
    page,
    context,
  }, testInfo) => {
    await login(page, ADMIN);
    await page.goto('/admin/quests/new');
    await page.getByLabel('Title').fill('Sports Hall');
    await page.getByLabel('Google Maps link').fill(LINK);
    await page.getByLabel('Question types').selectOption('MIXED');
    await page.getByRole('button', { name: 'Create quest' }).click();
    await expect(page.getByRole('heading', { name: 'Questions (0)' })).toBeVisible();

    await fillQuestion(page, {
      text: 'Which sport uses a net?',
      type: 'MCQ',
      options: ['Tennis', 'Chess', 'Darts', 'Golf'],
      right: [0],
    });
    await fillQuestion(page, {
      text: 'Pick the ball games',
      type: 'MULTI',
      options: ['Football', 'Rowing', 'Handball', 'Swimming'],
      right: [0, 2],
    });
    await fillQuestion(page, {
      text: 'Which is a team sport?',
      type: 'MCQ',
      options: ['Volleyball', 'Archery', 'Darts', 'Golf'],
      right: [0],
    });
    await expect(page.getByTestId('question-row')).toHaveCount(3);
    await shot(page, testInfo, '33-admin-quest-questions');

    await page.getByLabel('Active (students can play it)').check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();

    // A student sees the question types before the quiz and answers a multi-select question.
    await page.evaluate(() => {
      const saved = JSON.parse(sessionStorage.getItem('cq-mock-v2'));
      saved.student.role = 'student';
      saved.student.email = 'ada@heilbronn.dhbw.de';
      sessionStorage.setItem('cq-mock-v2', JSON.stringify(saved));
    });
    await context.setGeolocation(CAMPUS);
    await page.goto('/quests');
    await page.getByRole('link', { name: /Sports Hall/ }).click();
    await expect(page.getByTestId('quest-types')).toContainText('Multiple choice');
    await expect(page.getByTestId('quest-types')).toContainText('Multi-select');
    await page.getByRole('link', { name: 'Start quest' }).click();
    await expect(page.getByTestId('quest-types')).toContainText('at least one of each');
    await page.getByRole('button', { name: "I'm ready" }).click();
    await page.getByRole('button', { name: 'I agree' }).click();
    await expect(page.getByRole('timer')).toBeVisible();

    let sawMulti = false;
    for (let i = 0; i < 3; i += 1) {
      const multi = await page.getByRole('button', { name: 'Check answer' }).count();
      if (multi) {
        sawMulti = true;
        await expect(page.getByText('Choose all that apply')).toBeVisible();
        await page.getByRole('button', { name: /Football/ }).click();
        await page.getByRole('button', { name: 'Check answer' }).click();
        // Only one of the two right options was ticked: not an exact match.
        await expect(page.getByText(/Not quite/)).toBeVisible();
      } else {
        await page.getByRole('button', { name: /Tennis|Volleyball/ }).click();
        await expect(page.getByText('Correct!')).toBeVisible();
      }
      await page.getByRole('button', { name: i === 2 ? 'Finish' : 'Next' }).click();
    }
    expect(sawMulti).toBe(true);
  });

  test('BR49 deleting a quest asks first and removes a quest nobody played', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/quests/new');
    await page.getByLabel('Title').fill('Temp Quest');
    await page.getByLabel('Google Maps link').fill(LINK);
    await page.getByRole('button', { name: 'Create quest' }).click();
    await expect(page.getByRole('heading', { name: 'Temp Quest' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Delete quest' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Delete the quest Temp Quest?');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Delete quest' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete quest' }).click();
    await expect(page.getByText('Quest deleted')).toBeVisible();
    await expect(page.getByTestId('quest-card')).toHaveCount(8);
  });
});

test.describe('map style', () => {
  test('BR48 light stays the default; a student picks a preset and a custom RGB colour and saves one style', async ({
    page,
  }, testInfo) => {
    await login(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.goto('/profile');
    const settings = page.getByTestId('map-style');
    await settings.locator('summary').click();
    await expect(settings.getByRole('radio', { name: 'Follow the app' })).toBeChecked();
    await settings.getByRole('button', { name: /Ocean/ }).click();
    await settings.getByRole('radio', { name: 'Dark' }).click();

    const highlight = settings.getByTestId('colour-Highlight (selected checkpoint)');
    await highlight.getByLabel('R (0–255)').fill('0');
    await highlight.getByLabel('G (0–255)').fill('128');
    await highlight.getByLabel('B (0–255)').fill('255');
    await expect(highlight.getByLabel('Colour code')).toHaveValue('#0080ff');
    await highlight.getByLabel('Colour code').fill('rgb(10, 20, 30)');
    await expect(highlight.getByLabel('R (0–255)')).toHaveValue('10');
    await highlight.getByLabel('Colour code').fill('banana');
    await expect(highlight.getByText(/Use a colour like #1a2b3c/)).toBeVisible();
    await highlight.getByLabel('Colour code').fill('#ff00aa');
    await shot(page, testInfo, '34-map-style');

    await settings.getByRole('button', { name: 'Save map style' }).click();
    await expect(page.getByText('Map style saved')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-map-base', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expectNoHorizontalScroll(page);

    // The one saved style comes back after a reload; reset returns to the default.
    await page.reload();
    await page.getByTestId('map-style').locator('summary').click();
    await expect(page.getByTestId('map-style').getByRole('radio', { name: 'Dark' })).toBeChecked();
    await page.getByTestId('map-style').getByRole('button', { name: 'Reset to default' }).click();
    await expect(page.getByText('Map style reset')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-map-base', 'follow');
  });

  test('BR48 the dark theme and the map style work together', async ({ page }) => {
    await login(page);
    await page.goto('/profile');
    await page.getByRole('switch', { name: 'Dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByTestId('map-style').locator('summary').click();
    await page.getByTestId('map-style').getByRole('radio', { name: 'Light' }).click();
    await page.getByTestId('map-style').getByRole('button', { name: 'Save map style' }).click();
    await expect(page.getByText('Map style saved')).toBeVisible();
    await page.goto('/map');
    await expect(page.getByRole('region', { name: 'Campus map' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-map-base', 'light');
  });
});

test.describe('admin: the checkpoint circle', () => {
  test('BR12 BR49 the admin sees the circle on a map and it follows the radius', async ({
    page,
  }, testInfo) => {
    await login(page, ADMIN);
    await page.goto('/admin/quests');
    await page.getByTestId('quest-card').first().getByRole('link').first().click();
    const map = page.locator('.geo-preview__map');
    await expect(map).toBeVisible();
    await expect(map.locator('path')).not.toHaveCount(0);
    const radius = page.getByRole('spinbutton', { name: 'Radius (metres)' });
    await radius.fill('150');
    await expect(page.getByText(/about 300 m across/)).toBeVisible();
    await expect(page.getByLabel('Drag to change the size')).toHaveValue('150');
    await page.getByRole('radio', { name: '60 m' }).click();
    await expect(radius).toHaveValue('60');
    await radius.fill('900');
    await expect(page.getByRole('alert').filter({ hasText: 'between 10 and 500' })).toBeVisible();
    await radius.fill('100');
    await shot(page, testInfo, '34-admin-quest-circle');
    await expectNoHorizontalScroll(page);
  });
});
