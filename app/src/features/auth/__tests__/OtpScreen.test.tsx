import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import { ApiError } from '../../../api/client';
import { toast } from '../../../components';
import { OtpScreen } from '../OtpScreen';
import { confirmCode, sendCode } from '../phoneAuth';

jest.mock('../phoneAuth', () => ({
  ...jest.requireActual('../phoneAuth'),
  confirmCode: jest.fn(),
  sendCode: jest.fn(),
  devCodeFor: () => null,
}));
jest.mock('../../../components', () => ({
  ...jest.requireActual('../../../components'),
  toast: jest.fn(),
}));

const nav = { navigate: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() };
const props = (params: Record<string, unknown>) =>
  ({
    navigation: nav,
    route: { key: 'Otp', name: 'Otp', params: { phone: '+919876543210', ...params } },
  }) as unknown as ComponentProps<typeof OtpScreen>;

beforeEach(() => jest.clearAllMocks());

it('shows the number the way people write it', async () => {
  await render(<OtpScreen {...props({})} />);
  expect(screen.getByText('Sent to +91 98765 43210')).toBeTruthy();
});

it('checks the code by itself once all six digits are in, and only once', async () => {
  let finish: () => void = () => undefined;
  (confirmCode as jest.Mock).mockImplementation(
    () => new Promise<void>((r) => (finish = () => r())),
  );
  await render(<OtpScreen {...props({})} />);
  await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
  await waitFor(() =>
    expect(confirmCode).toHaveBeenCalledWith('+919876543210', '123456', undefined),
  );
  // Verify while the first check is still running does not send it again
  await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));
  expect(confirmCode).toHaveBeenCalledTimes(1);
  finish();
});

it('an expired Google / Apple sign-up says so and goes back to the start', async () => {
  (confirmCode as jest.Mock).mockRejectedValue(new ApiError(410, 'signup_expired'));
  await render(<OtpScreen {...props({ signupToken: 'S' })} />);
  await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
  await waitFor(() => expect(nav.popToTop).toHaveBeenCalled());
  expect(toast).toHaveBeenCalledWith('That sign-in took too long. Please start again.', 'error');
});

it('starts the resend countdown from what the server said', async () => {
  await render(<OtpScreen {...props({ resendIn: 42 })} />);
  expect(screen.getByRole('button', { name: 'Resend code in 42s' })).toBeTruthy();
});

it('a resend refused as too soon just restarts the countdown', async () => {
  (sendCode as jest.Mock).mockRejectedValue(new ApiError(429, 'too_soon', { retryAfter: 20 }));
  await render(<OtpScreen {...props({ resendIn: 0 })} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Resend code' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Resend code in 20s' })).toBeTruthy(),
  );
  expect(sendCode).toHaveBeenCalledTimes(1);
});
