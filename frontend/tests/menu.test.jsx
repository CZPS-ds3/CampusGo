import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { QuestMenu } from '../src/components/QuestMenu.jsx';

function setup(path = '/quests') {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<QuestMenu />} />
      </Routes>
    </MemoryRouter>,
    { container: root },
  );
  return { root, ...view };
}

const openButton = () => screen.getByRole('button', { name: 'Open menu' });

describe('GO badge menu', () => {
  it('opens with five destinations and marks the current page', async () => {
    const user = userEvent.setup();
    setup('/quests');
    expect(openButton()).toHaveAttribute('aria-expanded', 'false');
    await user.click(openButton());
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getAllByRole('menuitem')).toHaveLength(5);
    expect(screen.getByRole('menuitem', { name: /Quests/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('menuitem', { name: /Map/ })).not.toHaveAttribute('aria-current');
  });

  it('treats the locate and info screens as part of the map section', async () => {
    const user = userEvent.setup();
    setup('/locate/3');
    await user.click(openButton());
    expect(screen.getByRole('menuitem', { name: /Map/ })).toHaveAttribute('aria-current', 'page');
  });

  it('makes the page behind inert while open and removes it on Escape', async () => {
    const user = userEvent.setup();
    const { root } = setup();
    await user.click(openButton());
    expect(root).toHaveAttribute('inert');
    await user.keyboard('{Escape}');
    expect(root).not.toHaveAttribute('inert');
    expect(openButton()).toHaveFocus();
  });

  it('puts focus on the current bar and walks the bars with the arrow keys', async () => {
    const user = userEvent.setup();
    setup('/quests');
    await user.click(openButton());
    await waitFor(() => expect(screen.getByRole('menuitem', { name: /Quests/ })).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /Team/ })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: /Map/ })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: /Profile/ })).toHaveFocus();
  });

  it('keeps Tab inside the menu: badge and current bar only', async () => {
    const user = userEvent.setup();
    setup('/quests');
    await user.click(openButton());
    await waitFor(() => expect(screen.getByRole('menuitem', { name: /Quests/ })).toHaveFocus());
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('menuitem', { name: /Quests/ })).toHaveFocus();
  });

  it('closes when the scrim is clicked', async () => {
    const user = userEvent.setup();
    const { baseElement } = setup();
    await user.click(openButton());
    await user.click(baseElement.querySelector('.scrim'));
    await waitFor(() => expect(screen.queryAllByRole('menuitem')).toHaveLength(0));
  });
});
