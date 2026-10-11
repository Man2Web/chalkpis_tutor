import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import { api, ApiError } from '../../../api/client';
import { toast } from '../../../components';
import { useSession } from '../../auth/session';
import { AddPhoneScreen } from '../AddPhoneScreen';

jest.mock('../../../api/client', () => ({
  ...jest.requireActual('../../../api/client'),
  api: jest.fn(),
}));
jest.mock('../../../components', () => ({
  ...jest.requireActual('../../../components'),
  toast: jest.fn(),
}));
jest.mock('../../../lib/analytics', () => ({ track: jest.fn(), reportError: jest.fn() }));

const call = api as jest.Mock;
const nav = { navigate: jest.fn(), goBack: jest.fn() };
const props = {
  navigation: nav,
  route: { key: 'AddPhone', name: 'AddPhone', params: undefined },
} as unknown as ComponentProps<typeof AddPhoneScreen>;

const me = (phone: string | null) => ({
  user: { id: 'u1', phone, email: null, name: 'Priya', language: 'en' },
  signInMethods: [{ provider: 'apple', email: null, since: '2026-10-01' }],
  isAdmin: false,
  membership: { instituteId: 'I1', role: 'owner', onboardingDone: true },
});

beforeEach(() => {
  jest.clearAllMocks();
  useSession.getState().set({ uid: 'u1', profile: null, status: 'ready' });
});

/** Step 1: type the number and send the code. */
async function sendTo(number: string) {
  await render(<AddPhoneScreen {...props} />);
  expect(screen.getByText(/so parents and helpers can reach you/)).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), number);
  await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
}

it('refuses a number that cannot be right, without sending anything', async () => {
  await sendTo('12345');
  expect(screen.getByText('Enter a valid 10-digit mobile number')).toBeTruthy();
  expect(call).not.toHaveBeenCalled();
});

it('sends the code, checks it by itself, puts the number on the account and goes back', async () => {
  call.mockImplementation(async (_m: string, path: string) => {
    if (path === '/me/phone/request') return { ok: true, resendInSeconds: 60 };
    if (path === '/me/phone/verify') return me('+919876543210');
    throw new Error(`unexpected ${path}`);
  });
  await sendTo('98765 43210');
  expect(call).toHaveBeenCalledWith('POST', '/me/phone/request', { phone: '+919876543210' });
  expect(await screen.findByText('Sent to +91 98765 43210')).toBeTruthy();
  expect(screen.getByText('Resend code in 60s')).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('POST', '/me/phone/verify', {
      phone: '+919876543210',
      code: '123456',
    }),
  );
  await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
  expect(call.mock.calls.filter((c) => c[1] === '/me/phone/verify')).toHaveLength(1);
  expect(useSession.getState().profile?.phone).toBe('+919876543210');
  expect(toast).toHaveBeenCalledWith('Mobile number added', 'success');
});

it('shows the test-mode code when the server sends one', async () => {
  call.mockResolvedValueOnce({ ok: true, resendInSeconds: 60, devCode: '654321' });
  await sendTo('9876543210');
  expect(await screen.findByText('654321')).toBeTruthy();
});

it('a number that already has its own account is explained, and nothing changes', async () => {
  call.mockImplementation(async (_m: string, path: string) => {
    if (path === '/me/phone/request') return { ok: true, resendInSeconds: 60 };
    throw new ApiError(409, 'phone_in_use');
  });
  await sendTo('9876543210');
  await screen.findByText('Sent to +91 98765 43210');
  await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
  expect(
    await screen.findByText(
      'This number already has its own Chalkpis account. To use it, sign out and continue with WhatsApp.',
    ),
  ).toBeTruthy();
  expect(nav.goBack).not.toHaveBeenCalled();
  expect(useSession.getState().profile).toBeNull();
});

it('too many tries is said plainly', async () => {
  call.mockRejectedValueOnce(new ApiError(429, 'too_many', { retryAfter: 3600 }));
  await sendTo('9876543210');
  expect(
    await screen.findByText('Too many attempts. Please wait a while and try again.'),
  ).toBeTruthy();
});
