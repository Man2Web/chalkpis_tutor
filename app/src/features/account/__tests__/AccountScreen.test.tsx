import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../../i18n';
import type { UserProfile } from '../../../lib/types';
import { AccountScreen } from '../AccountScreen';

const mockNavigate = jest.fn();
let mockProfile: UserProfile;

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../../../data/hooks', () => ({
  useInstitute: () => ({ data: { name: 'Bright Classes' } }),
  useLimits: () => ({ data: undefined }),
}));
jest.mock('../../auth/session', () => ({
  useSession: (sel: (s: { profile: UserProfile }) => unknown) => sel({ profile: mockProfile }),
  useIsStaff: () => false,
  logout: jest.fn(),
}));
jest.mock('../../settings/DeleteAccountSheet', () => ({ DeleteAccountSheet: () => null }));

const base: UserProfile = {
  name: 'Priya',
  phone: '+919876543210',
  language: 'en',
  role: 'owner',
  instituteId: 'I1',
};

beforeEach(() => jest.clearAllMocks());

it('an older account without a mobile number offers to add one, and never shows "null"', async () => {
  mockProfile = { ...base, phone: null };
  await render(<AccountScreen />);
  expect(screen.getByText('Not added')).toBeTruthy();
  expect(screen.getByText('Bright Classes')).toBeTruthy();
  expect(screen.queryByText(/null/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'WhatsApp, Not added' }));
  expect(mockNavigate).toHaveBeenCalledWith('AddPhone');
});

it('an account with a number shows it, with nothing to add', async () => {
  mockProfile = base;
  await render(<AccountScreen />);
  expect(screen.getAllByText(/\+919876543210/).length).toBeGreaterThan(0);
  expect(screen.queryByText('Not added')).toBeNull();
  expect(screen.queryByText('Add your mobile number')).toBeNull();
});

it('lists WhatsApp as the only way to sign in', async () => {
  mockProfile = base;
  await render(<AccountScreen />);
  expect(screen.getByText('WhatsApp')).toBeTruthy();
  for (const other of ['Google', 'Apple', 'Email']) expect(screen.queryByText(other)).toBeNull();
});
