import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import { SettingsScreen, PaymentSettingsScreen } from '../SettingsScreen';
import { DeleteAccountSheet } from '../DeleteAccountSheet';
import { api } from '../../../api/client';

const mockCall = jest.fn().mockResolvedValue({ data: { ok: true } });
const mockLogout = jest.fn().mockResolvedValue(undefined);
const mockBack = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../api/client', () => ({
  api: jest.fn(() => mockCall()),
  uploadImage: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('../../../lib/analytics', () => ({ reportError: jest.fn() }));
jest.mock('../../../data/hooks', () => ({
  useInstitute: () => ({
    isLoading: false,
    data: { name: 'Sunrise', receiptPrefix: 'TD', address: '', phone: '', upiId: '' },
  }),
  useInstituteId: () => 'I1',
  useRefreshData: () => jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../auth/session', () => ({
  useSession: () => ({ uid: 'u1', profile: { name: 'Meena', phone: '+919000000001' } }),
  logout: () => mockLogout(),
  refreshProfile: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => jest.clearAllMocks());

const nav = { goBack: mockBack } as never;

describe('delete account', () => {
  const openSheet = () => render(<DeleteAccountSheet visible onClose={jest.fn()} />);

  it('stays locked until DELETE is typed, and does nothing before that', async () => {
    await openSheet();
    const confirm = screen.getByRole('button', { name: 'Delete forever' });
    expect(confirm.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(confirm);
    expect(mockCall).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Type DELETE'), 'delet');
    expect(
      screen.getByRole('button', { name: 'Delete forever' }).props.accessibilityState.disabled,
    ).toBe(true);
  });

  it('typing DELETE deletes the account on the server once and signs out', async () => {
    await openSheet();
    await fireEvent.changeText(screen.getByLabelText('Type DELETE'), 'delete');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete forever' }));
    await waitFor(() => expect(mockCall).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledWith('DELETE', '/account', { confirm: true });
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });

  it('if the server fails, the user stays signed in and sees an error', async () => {
    mockCall.mockRejectedValueOnce(new Error('boom'));
    await openSheet();
    await fireEvent.changeText(screen.getByLabelText('Type DELETE'), 'DELETE');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete forever' }));
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    expect(mockLogout).not.toHaveBeenCalled();
  });
});

it('rejects a bad receipt prefix without saving', async () => {
  await render(<SettingsScreen navigation={nav} />);
  await fireEvent.changeText(screen.getByLabelText('Receipt prefix'), 'T-D');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByText('Use 2 to 6 letters or digits')).toBeTruthy();
  expect(api).not.toHaveBeenCalled();
});

it('saves a valid UPI id in lower case and refuses a bad one', async () => {
  await render(<PaymentSettingsScreen navigation={nav} route={{} as never} />);
  await fireEvent.changeText(screen.getByLabelText('Your UPI id'), 'not-a-upi');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByText('Enter a UPI id like name@bank')).toBeTruthy();
  expect(api).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Your UPI id'), 'Meena@OkSBI');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('PATCH', '/institute', {
      upiId: 'meena@oksbi',
      paymentLink: '',
    }),
  );
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
});
