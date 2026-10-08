import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import { PhoneLoginScreen } from '../PhoneLoginScreen';
import { sendCode } from '../phoneAuth';

jest.mock('../phoneAuth', () => ({
  sendCode: jest.fn(),
  authErrorKey: jest.requireActual('../authErrors').authErrorKey,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

const navigation = { navigate: jest.fn() } as never;
const route = { key: 'k', name: 'Phone' } as never;
const mockSend = sendCode as jest.Mock;

beforeEach(() => jest.clearAllMocks());

it('blocks an invalid number without calling Firebase', async () => {
  await render(<PhoneLoginScreen navigation={navigation} route={route} />);
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '12345');
  await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
  expect(screen.getByText('Enter a valid 10-digit mobile number')).toBeTruthy();
  expect(mockSend).not.toHaveBeenCalled();
});

it('sends the code and moves to the OTP screen', async () => {
  mockSend.mockResolvedValue('+919876543210');
  await render(<PhoneLoginScreen navigation={navigation} route={route} />);
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '98765 43210');
  await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
  await waitFor(() =>
    expect((navigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith('Otp', {
      phone: '+919876543210',
    }),
  );
});

it('shows a friendly message when Firebase rejects', async () => {
  mockSend.mockRejectedValue({ code: 'auth/too-many-requests' });
  await render(<PhoneLoginScreen navigation={navigation} route={route} />);
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9876543210');
  await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
  await waitFor(() =>
    expect(screen.getByText('Too many attempts. Please wait a while and try again.')).toBeTruthy(),
  );
});
