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

describe('quest menu', () => {
  it('opens with five destinations and marks the current page', async () => {
    const user = userEvent.setup();
    setup('/quests');
    const trigger = screen.getByRole('button', { name: 'Menu' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('menuitem')).toHaveLength(5);
    expect(screen.getByRole('menuitem', { name: /Quests/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('menuitem', { name: /Map/ })).not.toHaveAttribute('aria-current');
  });

  it('makes the page behind inert while open and removes it on Escape', async () => {
    const user = userEvent.setup();
    const { root } = setup();
    const trigger = screen.getByRole('button', { name: 'Menu' });
    await user.click(trigger);
    expect(root).toHaveAttribute('inert');
    await user.keyboard('{Escape}');
    expect(root).not.toHaveAttribute('inert');
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('puts focus on the current stone and walks the stones with the arrow keys', async () => {
    const user = userEvent.setup();
    setup('/quests');
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await waitFor(() => expect(screen.getByRole('menuitem', { name: /Quests/ })).toHaveFocus());
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: /Team/ })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: /Map/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /Profile/ })).toHaveFocus();
  });

  it('keeps Tab inside the menu: trigger and current stone only', async () => {
    const user = userEvent.setup();
    setup('/quests');
    const trigger = screen.getByRole('button', { name: 'Menu' });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole('menuitem', { name: /Quests/ })).toHaveFocus());
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('menuitem', { name: /Quests/ })).toHaveFocus();
  });

  it('closes when the scrim is clicked', async () => {
    const user = userEvent.setup();
    const { baseElement } = setup();
    const trigger = screen.getByRole('button', { name: 'Menu' });
    await user.click(trigger);
    await user.click(baseElement.querySelector('.menu__scrim'));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
