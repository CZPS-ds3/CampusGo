import { useRef } from 'react';
import { copy } from '../i18n.js';

const LENGTH = 6;

/**
 * Six one-digit boxes. Typing moves on, Backspace moves back, pasting a code fills all boxes.
 * `value` is a string of up to six digits.
 */
export function OTPInput({ value, onChange, disabled }) {
  const refs = useRef([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '');

  const focusBox = (index) => refs.current[Math.max(0, Math.min(LENGTH - 1, index))]?.focus();
  const commit = (next) => onChange(next.replace(/\D/g, '').slice(0, LENGTH));

  const handleChange = (index, text) => {
    const clean = text.replace(/\D/g, '');
    if (!clean) return;
    if (clean.length > 1) {
      // A browser may hand over a whole code (autofill, paste without our handler).
      commit(value.slice(0, index) + clean);
      focusBox(index + clean.length);
      return;
    }
    const next = digits.slice();
    next[index] = clean;
    commit(next.join(''));
    focusBox(index + 1);
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (digits[index]) {
        const next = digits.slice();
        next[index] = '';
        commit(next.join(''));
      } else if (index > 0) {
        const next = digits.slice();
        next[index - 1] = '';
        commit(next.join(''));
        focusBox(index - 1);
      }
    } else if (event.key === 'ArrowLeft') {
      focusBox(index - 1);
    } else if (event.key === 'ArrowRight') {
      focusBox(index + 1);
    }
  };

  const handlePaste = (event) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!pasted) return;
    event.preventDefault();
    commit(pasted);
    focusBox(pasted.length >= LENGTH ? LENGTH - 1 : pasted.length);
  };

  return (
    <div className="otp" role="group" aria-label="One-time code" onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          className="otp__box"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={LENGTH}
          aria-label={`${copy.login.otpLabel} ${index + 1}`}
          value={digit}
          disabled={disabled}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  );
}
