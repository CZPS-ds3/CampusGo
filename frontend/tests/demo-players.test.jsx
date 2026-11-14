// BR56: the admin switch that shows the invented demo players, and the mock API following it like the server.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockApi } from '../src/api/mock.js';
import AdminSettings from '../src/pages/admin/AdminSettings.jsx';
import { ToastProvider } from '../src/hooks/useToast.jsx';

const client = vi.hoisted(() => ({
  api: {
    admin: {
      settings: vi.fn(),
      saveSettings: vi.fn(),
    },
  },
}));
vi.mock('../src/api/client.js', () => client);

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const SETTINGS = { otpPreview: false, showDemo: false, mailConfigured: true, environment: 'test' };

beforeEach(() => {
  sessionStorage.clear();
  client.api.admin.settings.mockResolvedValue({ settings: SETTINGS });
  client.api.admin.saveSettings.mockImplementation(async (patch) => ({
    settings: { ...SETTINGS, ...patch },
  }));
});

describe('BR56 the demo players switch', () => {
  it('BR56 sits on the settings page with the code preview and shows the demo players at a tap', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <AdminSettings />
      </ToastProvider>,
    );
    const card = await screen.findByTestId('demo-players');
    expect(
      screen.getByRole('switch', { name: 'Show login codes on the login page' }),
    ).toBeVisible();
    const toggle = screen.getByRole('switch', { name: 'Show demo players' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(card).toHaveTextContent('Hidden');
    await user.click(toggle);
    expect(client.api.admin.saveSettings).toHaveBeenCalledWith({ showDemo: true });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(card).toHaveTextContent('Shown');
  });
});

describe('BR56 the mock API hides its invented players like the server', () => {
  it('BR56 hidden: only the student is ranked, the invented players have no profile and are not listed', async () => {
    const api = createMockApi(ApiError, () => () => {});
    await api.verify({
      email: 'sekretariat.dski@heilbronn.dhbw.de',
      otp: '123456',
      firstName: 'Study',
      lastName: 'Office',
    });
    expect((await api.admin.settings()).settings.showDemo).toBe(true); // the mock starts with them shown
    const before = (await api.admin.users()).users.length;
    expect(before).toBeGreaterThan(0);
    await api.admin.saveSettings({ showDemo: false });
    expect((await api.admin.users()).users).toEqual([]);
    expect((await api.admin.teams()).teams).toEqual([]);
    expect((await api.admin.stats()).topPlayers).toEqual([]);
    expect((await api.admin.settings()).settings.otpPreview).toBe(true); // the other switch is untouched

    // A person the admin adds is real and stays listed.
    await api.admin.createUser({
      email: 'new.person@heilbronn.dhbw.de',
      firstName: 'New',
      lastName: 'Person',
    });
    expect((await api.admin.users()).users.map((u) => u.email)).toEqual([
      'new.person@heilbronn.dhbw.de',
    ]);
    await api.admin.saveSettings({ showDemo: true });
    expect((await api.admin.users()).users).toHaveLength(before + 1);
  });

  it('BR56 hidden: a student sees only themselves on the solo board and is first', async () => {
    const api = createMockApi(ApiError, () => () => {});
    await api.verify({
      email: 'sekretariat.dski@heilbronn.dhbw.de',
      otp: '123456',
      firstName: 'Study',
      lastName: 'Office',
    });
    await api.admin.saveSettings({ showDemo: false });
    await api.logout();
    await api.verify({
      email: 'ada@heilbronn.dhbw.de',
      otp: '123456',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    const board = await api.soloBoard();
    expect(board.entries).toHaveLength(1);
    expect(board.you.rank).toBe(1);
    await expect(api.player(101)).rejects.toMatchObject({ status: 404 });
  });
});
