import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { OTPInput } from '../src/components/OTPInput.jsx';

function Harness({ initial = '' }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <OTPInput value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

const box = (n) => screen.getByLabelText(`One-time code, digit ${n}`);

describe('BR01 OTP input', () => {
  it('moves to the next box after each digit', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(box(1));
    await user.keyboard('123');
    expect(screen.getByTestId('value')).toHaveTextContent('123');
    expect(box(4)).toHaveFocus();
  });

  it('fills all six boxes when a code is pasted', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(box(1));
    await user.paste('654 321');
    expect(screen.getByTestId('value')).toHaveTextContent('654321');
    expect(box(6)).toHaveFocus();
  });

  it('ignores letters and symbols', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(box(1));
    await user.keyboard('a-1');
    expect(screen.getByTestId('value')).toHaveTextContent('1');
  });

  it('Backspace clears the box and steps back when it is already empty', async () => {
    const user = userEvent.setup();
    render(<Harness initial="12" />);
    await user.click(box(3));
    await user.keyboard('{Backspace}');
    expect(box(2)).toHaveFocus();
    expect(screen.getByTestId('value')).toHaveTextContent('1');
  });

  it('never keeps more than six digits', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(box(1));
    await user.paste('12345678');
    expect(screen.getByTestId('value')).toHaveTextContent('123456');
  });
});
