import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Ranks from '../src/pages/Ranks.jsx';

const board = vi.hoisted(() => ({ entries: [] }));
vi.mock('../src/api/client.js', () => ({
  api: { soloBoard: async () => ({ entries: board.entries, you: null }), teamBoard: vi.fn() },
}));
vi.mock('../src/hooks/useSession.jsx', () => ({
  useSession: () => ({ student: { teamId: null } }),
}));
vi.mock('../src/hooks/useToast.jsx', () => ({ useToast: () => ({ info: vi.fn() }) }));

const watchers = [];
beforeEach(() => {
  board.entries = Array.from({ length: 25 }, (_, i) => ({
    rank: i + 1,
    id: i + 1,
    displayName: `Player ${i + 1}`,
    pictureUrl: null,
    avatarPreset: 0,
    points: 5000 - i * 10,
    isYou: false,
  }));
  watchers.length = 0;
  globalThis.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
      watchers.push(this);
    }
    observe() {}
    disconnect() {}
  };
});
afterEach(() => {
  delete globalThis.IntersectionObserver;
});

const names = () => screen.getAllByText(/^Player \d+$/).map((node) => node.textContent);
const scrollToEnd = () => act(() => watchers.at(-1).callback([{ isIntersecting: true }]));

describe('BR24 leaderboard shows 10 ranks and loads the rest while scrolling', () => {
  it('starts with ranks 1 to 10 in a scrollable list', async () => {
    render(
      <MemoryRouter>
        <Ranks />
      </MemoryRouter>,
    );
    await screen.findByText('Player 1');
    expect(names()).toHaveLength(10);
    expect(names().at(-1)).toBe('Player 10');
    expect(screen.getByRole('region', { name: 'More ranks' })).toBeInTheDocument();
  });

  it('adds 10 more each time the end of the list is reached, until all 25 are shown', async () => {
    render(
      <MemoryRouter>
        <Ranks />
      </MemoryRouter>,
    );
    await screen.findByText('Player 1');
    await scrollToEnd();
    expect(names()).toHaveLength(20);
    await scrollToEnd();
    expect(names()).toHaveLength(25);
    expect(names().at(-1)).toBe('Player 25');
    expect(
      screen.getByRole('region', { name: 'More ranks' }).querySelector('.board-scroll__end'),
    ).toBeNull();
  });

  it('shows no scroll box when there are 10 ranks or fewer', async () => {
    board.entries = board.entries.slice(0, 8);
    render(
      <MemoryRouter>
        <Ranks />
      </MemoryRouter>,
    );
    await screen.findByText('Player 1');
    expect(names()).toHaveLength(8);
    expect(watchers).toHaveLength(0);
  });
});
