// The live-position ball's colours on the profile's map style card (BR48).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapStyleSettings } from '../src/components/MapStyleSettings.jsx';
import { ToastProvider } from '../src/hooks/useToast.jsx';
import { DEFAULT_MAP_STYLE, PRESETS, cleanStyle, styleVariables } from '../src/mapStyle.js';

const api = vi.hoisted(() => ({
  saveMapStyle: vi.fn(async (style) => ({ style })),
}));
vi.mock('../src/api/client.js', () => ({ api }));

beforeEach(() => api.saveMapStyle.mockClear());

describe('BR48 the ball colours in the map style', () => {
  it('BR48 the default ball writes no CSS variables, so it stays white with red lines', () => {
    const variables = styleVariables(DEFAULT_MAP_STYLE);
    expect(variables['--puck-body']).toBeUndefined();
    expect(variables['--puck-lines']).toBeUndefined();
    expect(variables['--puck-beam']).toBeUndefined();
  });

  it('BR48 a custom ball sets its body, its lines and the direction wedge in the line colour', () => {
    const style = cleanStyle({ ball: { body: '#123456', lines: '#00ff00' } });
    const variables = styleVariables(style);
    expect(variables['--puck-body']).toBe('#123456');
    expect(variables['--puck-lines']).toBe('#00ff00');
    expect(variables['--puck-beam']).toContain('#00ff0080');
  });

  it('BR48 a broken stored ball colour falls back to the default', () => {
    expect(cleanStyle({ ball: { body: 'url(x)', lines: 'nope' } }).ball).toEqual(
      DEFAULT_MAP_STYLE.ball,
    );
  });

  it('BR48 every preset has a ball that suits it', () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      expect(cleanStyle(preset).ball, name).toEqual(preset.ball);
    }
    expect(PRESETS.ocean.ball.lines).toBe(PRESETS.ocean.route);
  });

  it('BR48 the student picks a ball colour, sees it in the preview and saves it', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MapStyleSettings />
      </ToastProvider>,
    );
    await user.click(screen.getByText('Customisation'));
    await user.dblClick(screen.getByRole('button', { name: /Your position: ball/ }));
    let dialog = screen.getByRole('dialog', { name: 'Your position: ball' });
    const field = within(dialog).getByRole('textbox');
    await user.clear(field);
    await user.type(field, '#0055aa');
    const preview = within(dialog).getByRole('img', { name: 'Preview of your map style' });
    expect(preview.style.getPropertyValue('--puck-body')).toBe('#0055aa');
    expect(within(dialog).getByTestId('preview-ball')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    await user.dblClick(screen.getByRole('button', { name: 'Your position: direction indicator' }));
    dialog = screen.getByRole('dialog', { name: 'Your position: direction indicator' });
    const lines = within(dialog).getByRole('textbox');
    await user.clear(lines);
    await user.type(lines, 'rgb(0, 128, 0)');
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: 'Save customisation' }));
    expect(api.saveMapStyle).toHaveBeenCalledWith(
      expect.objectContaining({ ball: { body: '#0055aa', lines: '#008000' } }),
    );
  });
});
