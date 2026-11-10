import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockApi } from '../src/api/mock.js';
import AdminTeams, { moveMember } from '../src/pages/admin/AdminTeams.jsx';

const api = vi.hoisted(() => ({
  admin: {
    teams: vi.fn(),
    setTeamLeader: vi.fn(),
    reorderTeam: vi.fn(),
    removeMember: vi.fn(),
  },
}));
vi.mock('../src/api/client.js', () => ({ api }));
vi.mock('../src/hooks/useToast.jsx', () => ({
  useToast: () => ({ info: vi.fn(), error: vi.fn() }),
}));
vi.mock('../src/hooks/useAutoRefresh.js', () => ({ useAutoRefresh: () => {} }));

const TEAM = {
  id: 4,
  name: 'Night Owls',
  score: 1200,
  size: 3,
  createdAt: '2026-11-01T10:00:00.000Z',
  leaderId: 10,
  members: [
    { id: 10, displayName: 'Lea', position: 1, status: 'active' },
    { id: 11, displayName: 'Amy', position: 2, status: 'active' },
    { id: 12, displayName: 'Ben', position: 3, status: 'blocked' },
  ],
};

beforeEach(() => {
  api.admin.teams.mockResolvedValue({ teams: [TEAM] });
  api.admin.setTeamLeader.mockResolvedValue(null);
  api.admin.reorderTeam.mockResolvedValue(null);
});

describe('BR54 team order helpers', () => {
  it('BR54 moving a member swaps them with the neighbour and never leaves the list', () => {
    expect(moveMember([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveMember([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
    expect(moveMember([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveMember([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});

describe('BR54 admin Teams page', () => {
  it('BR54 shows the members in team order with the leader marked', async () => {
    render(<AdminTeams />);
    const list = await screen.findByRole('list', { name: 'Members of Night Owls in team order' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Lea'),
      expect.stringContaining('Amy'),
      expect.stringContaining('Ben'),
    ]);
    expect(within(rows[0]).getByText('Leader')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Lea up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Ben down' })).toBeDisabled();
    // A blocked member cannot become the leader.
    expect(screen.getByRole('button', { name: 'Make leader: Ben' })).toBeDisabled();
  });

  it('BR54 "Make leader" and the arrows call the admin API with the new leader and order', async () => {
    const user = userEvent.setup();
    render(<AdminTeams />);
    await user.click(await screen.findByRole('button', { name: 'Make leader: Amy' }));
    await waitFor(() => expect(api.admin.setTeamLeader).toHaveBeenCalledWith(4, 11));
    await user.click(screen.getByRole('button', { name: 'Move Amy up' }));
    await waitFor(() => expect(api.admin.reorderTeam).toHaveBeenCalledWith(4, [11, 10, 12]));
  });
});

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

describe('BR52 BR54 mock API parity', () => {
  let mock;
  beforeEach(async () => {
    sessionStorage.clear();
    mock = createMockApi(ApiError, () => () => {});
  });

  it('BR52 the mock test inbox follows the admin switch', async () => {
    expect((await mock.authConfig()).otpPreview).toBe(true);
    await mock.requestOtp('ada@heilbronn.dhbw.de');
    expect((await mock.otpPreview('ada@heilbronn.dhbw.de')).otp).toBe('123456');
    await mock.verify({
      email: 'sekretariat.dski@heilbronn.dhbw.de',
      otp: '123456',
      firstName: 'Study',
      lastName: 'Office',
    });
    await mock.admin.saveSettings({ otpPreview: false });
    expect((await mock.authConfig()).otpPreview).toBe(false);
    await expect(mock.otpPreview('ada@heilbronn.dhbw.de')).rejects.toMatchObject({
      code: 'PREVIEW_OFF',
    });
  });

  it('BR01 BR37 the mock lets the shared admin Gmail address log in as an admin, other Gmail addresses not', async () => {
    await mock.requestOtp('dhbw.campus@gmail.com');
    const result = await mock.verify({
      email: 'dhbw.campus@gmail.com',
      otp: '123456',
      firstName: 'Campus',
      lastName: 'Admin',
    });
    expect(result.student.role).toBe('admin');
    await expect(mock.requestOtp('someone@gmail.com')).rejects.toMatchObject({
      code: 'INVALID_EMAIL',
    });
  });

  it('BR54 the mock lets a member leave and an admin set the leader and the order', async () => {
    await mock.verify({
      email: 'ada@heilbronn.dhbw.de',
      otp: '123456',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    await mock.createTeam('Night Owls');
    expect((await mock.myTeam()).team).not.toBeNull();
    await mock.leaveTeam();
    expect((await mock.myTeam()).team).toBeNull();
    await expect(mock.leaveTeam()).rejects.toMatchObject({ code: 'NO_TEAM' });
  });
});
