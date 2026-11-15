import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockApi } from '../src/api/mock.js';
import AdminOverview from '../src/pages/admin/AdminOverview.jsx';

const api = vi.hoisted(() => ({ admin: { stats: vi.fn() } }));
vi.mock('../src/api/client.js', () => ({ api }));
vi.mock('../src/hooks/useToast.jsx', () => ({
  useToast: () => ({ info: vi.fn(), error: vi.fn() }),
}));

const TILES = {
  signedInNow: 0,
  activeStudents: 0,
  loginsToday: 0,
  loginsYesterday: 0,
  questsPassedToday: 0,
  questsPassedYesterday: 0,
};

const stats = (placeholders) => ({
  generatedAt: '2026-11-12T10:00:00.000Z',
  errors: {},
  tiles: TILES,
  daily: [],
  usersByStatus: { active: 0, blocked: 0, archived: 0 },
  checkpoints: [],
  topPlayers: [],
  topTeams: [],
  signedIn: [],
  recent: [],
  placeholders,
});

describe('BR11 BR29 placeholder warning on the admin dashboard', () => {
  it('BR11 the dashboard warns while placeholder questions and facts are live and names the quests', async () => {
    api.admin.stats.mockResolvedValue(
      stats({ questions: 19, facts: 6, quests: ['Mensa', 'Sensoricum'] }),
    );
    render(<AdminOverview />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Placeholder content is still live');
    expect(alert).toHaveTextContent('19 placeholder questions and 6 placeholder facts');
    expect(alert).toHaveTextContent('Mensa, Sensoricum');
  });

  it('BR11 no warning once every quest has real texts', async () => {
    api.admin.stats.mockResolvedValue(stats({ questions: 0, facts: 0, quests: [] }));
    render(<AdminOverview />);
    await screen.findByLabelText('Key numbers');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

describe('BR11 mock API parity', () => {
  beforeEach(() => sessionStorage.clear());

  it("BR11 the mock holds the team's bank and texts, so its dashboard reports no placeholder content", async () => {
    const mock = createMockApi(ApiError, () => () => {});
    await mock.verify({
      email: 'sekretariat.dski@heilbronn.dhbw.de',
      otp: '123456',
      firstName: 'Study',
      lastName: 'Office',
    });
    const { placeholders } = await mock.admin.stats();
    expect(placeholders).toEqual({ questions: 0, facts: 0, quests: [] });
  });
});
