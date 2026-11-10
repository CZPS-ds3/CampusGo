import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from '../src/pages/Login.jsx';

// Regression for "the profile picture chosen on the sign-up page does not show": the session used to be set
// before the picture was uploaded and was never updated, so the old avatar stayed until the next refresh.

const calls = vi.hoisted(() => ({ order: [], setStudent: vi.fn(), toastError: vi.fn() }));
const api = vi.hoisted(() => ({
  authConfig: vi.fn(),
  requestOtp: vi.fn(),
  otpPreview: vi.fn(),
  verify: vi.fn(),
  uploadPicture: vi.fn(),
}));

vi.mock('../src/api/client.js', () => ({ api, USE_MOCKS: false }));
vi.mock('../src/hooks/useSession.jsx', () => ({
  useSession: () => ({
    student: null,
    ready: true,
    setStudent: (value) => {
      calls.order.push('setStudent');
      calls.setStudent(value);
    },
  }),
}));
vi.mock('../src/hooks/useToast.jsx', () => ({
  useToast: () => ({ error: calls.toastError, info: vi.fn() }),
}));

const STUDENT = { id: 7, displayName: 'Ada L.', avatarPreset: 0, pictureUrl: null };

beforeEach(() => {
  calls.order.length = 0;
  calls.setStudent.mockReset();
  calls.toastError.mockReset();
  api.authConfig.mockResolvedValue({ otpPreview: false, mailConfigured: true });
  api.requestOtp.mockResolvedValue({});
  api.otpPreview.mockResolvedValue({ otp: '424242' });
  api.verify.mockImplementation(async (body) =>
    body.firstName ? { status: 'ok', student: STUDENT } : { status: 'profile_required' },
  );
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
  globalThis.URL.revokeObjectURL = vi.fn();
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
}

async function reachProfileStep(user) {
  renderLogin();
  await user.type(screen.getByLabelText('School email'), 'ada@heilbronn.dhbw.de');
  await user.click(screen.getByRole('button', { name: /Send code/ }));
  await user.click(await screen.findByLabelText('Digit 1 of 6'));
  await user.keyboard('123456');
  await screen.findByLabelText('First name *');
}

async function signUpWithPicture(user) {
  await reachProfileStep(user);
  const file = new File(['png'], 'me.png', { type: 'image/png' });
  await user.upload(screen.getByLabelText('Upload profile picture'), file);
  await user.type(screen.getByLabelText('First name *'), 'Ada');
  await user.type(screen.getByLabelText('Last name *'), 'Lovelace');
  await user.click(screen.getByRole('button', { name: /Enter campus/ }));
}

describe('BR02 sign-up picture', () => {
  it('BR02 the chosen picture is uploaded first and the session gets its address', async () => {
    api.uploadPicture.mockImplementation(async () => {
      calls.order.push('upload');
      return { pictureUrl: '/uploads/new.webp' };
    });
    const user = userEvent.setup();
    await signUpWithPicture(user);
    await waitFor(() => expect(calls.setStudent).toHaveBeenCalled());
    expect(calls.order).toEqual(['upload', 'setStudent']);
    expect(calls.setStudent).toHaveBeenCalledWith({ ...STUDENT, pictureUrl: '/uploads/new.webp' });
    expect(calls.toastError).not.toHaveBeenCalled();
  });

  it('BR02 a failed upload still logs the person in and says the picture was not saved', async () => {
    api.uploadPicture.mockRejectedValue(Object.assign(new Error('too big'), { code: 'X' }));
    const user = userEvent.setup();
    await signUpWithPicture(user);
    await waitFor(() => expect(calls.setStudent).toHaveBeenCalledWith(STUDENT));
    expect(calls.toastError).toHaveBeenCalledTimes(1);
    expect(calls.toastError.mock.calls[0][0]).toMatch(/picture was not saved/);
  });

  it('BR02 the preview of the chosen picture is made once, not on every key press', async () => {
    api.uploadPicture.mockResolvedValue({ pictureUrl: '/uploads/x.webp' });
    const user = userEvent.setup();
    await reachProfileStep(user);
    const file = new File(['png'], 'me.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Upload profile picture'), file);
    await user.type(screen.getByLabelText('First name *'), 'Ada Lovelace');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('BR02 without a picture nothing is uploaded and the session is set once', async () => {
    const user = userEvent.setup();
    await reachProfileStep(user);
    await user.type(screen.getByLabelText('First name *'), 'Ada');
    await user.type(screen.getByLabelText('Last name *'), 'Lovelace');
    await user.click(screen.getByRole('button', { name: /Enter campus/ }));
    await waitFor(() => expect(calls.setStudent).toHaveBeenCalledWith(STUDENT));
    expect(api.uploadPicture).not.toHaveBeenCalled();
  });
});

describe('BR01 BR37 which addresses the login page sends', () => {
  it('BR37 the shared admin Gmail address goes to the server instead of being blocked on the page', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('School email'), 'dhbw.campus@gmail.com');
    await user.click(screen.getByRole('button', { name: /Send code/ }));
    expect(await screen.findByLabelText('Digit 1 of 6')).toBeInTheDocument();
    expect(api.requestOtp).toHaveBeenCalledWith('dhbw.campus@gmail.com');
  });

  it('BR01 a domain the server refuses shows the school-address hint and stays on the e-mail step', async () => {
    api.requestOtp.mockRejectedValue(
      Object.assign(new Error('school only'), { status: 400, code: 'INVALID_EMAIL' }),
    );
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('School email'), 'someone@gmail.com');
    await user.click(screen.getByRole('button', { name: /Send code/ }));
    expect(await screen.findByText('Use your @heilbronn.dhbw.de school email')).toBeInTheDocument();
    expect(screen.queryByLabelText('Digit 1 of 6')).toBeNull();
  });

  it('BR01 an address without "@" is refused on the page without asking the server', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('School email'), 'not-an-address');
    await user.click(screen.getByRole('button', { name: /Send code/ }));
    expect(await screen.findByText('Use your @heilbronn.dhbw.de school email')).toBeInTheDocument();
    expect(api.requestOtp).not.toHaveBeenCalled();
  });
});

describe('BR52 test inbox on the login page', () => {
  it('BR52 the test inbox appears only while the admin switch is on and shows the e-mailed code', async () => {
    api.authConfig.mockResolvedValue({ otpPreview: true, mailConfigured: true });
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('School email'), 'ada@heilbronn.dhbw.de');
    await user.click(screen.getByRole('button', { name: /Send code/ }));
    await user.click(await screen.findByRole('button', { name: /Open mock inbox/ }));
    expect(api.otpPreview).toHaveBeenCalledWith('ada@heilbronn.dhbw.de');
    expect(await screen.findByText('424242')).toBeInTheDocument();
  });

  it('BR52 with the switch off there is no test inbox', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('School email'), 'ada@heilbronn.dhbw.de');
    await user.click(screen.getByRole('button', { name: /Send code/ }));
    await screen.findByLabelText('Digit 1 of 6');
    await waitFor(() => expect(api.authConfig).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Open mock inbox/ })).toBeNull();
  });
});
