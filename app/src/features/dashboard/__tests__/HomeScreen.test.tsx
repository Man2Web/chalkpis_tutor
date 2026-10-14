import { render, screen } from '@testing-library/react-native';
import '../../../i18n';
import { HomeScreen } from '../HomeScreen';
import {
  useAttendanceOn,
  useBatches,
  useLimits,
  usePaymentsThisMonth,
  useStudents,
  useUnpaidDues,
} from '../../../data/hooks';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../../auth/session', () => ({
  useSession: (sel: (s: { profile: { name: string } }) => unknown) =>
    sel({ profile: { name: 'Asha' } }),
}));
jest.mock('../../announcements/AnnouncementBanner', () => ({ AnnouncementBanner: () => null }));
jest.mock('../../fees/PaymentReportsCard', () => ({ PaymentReportsCard: () => null }));
jest.mock('../../onboarding/GettingStartedCard', () => ({ GettingStartedCard: () => null }));
jest.mock('../../onboarding/WelcomeTour', () => ({ WelcomeTour: () => null }));
jest.mock('../../tasks/api', () => ({
  useTasks: () => ({ data: [], isLoading: false }),
  useTaskActions: () => ({
    add: { mutate: jest.fn() },
    toggle: { mutate: jest.fn() },
    remove: { mutate: jest.fn() },
  }),
}));
jest.mock('../../../data/hooks', () => ({
  useStudents: jest.fn(),
  useBatches: jest.fn(),
  useAttendanceOn: jest.fn(),
  useAttendanceRange: () => ({ data: [], isLoading: false, isError: false }),
  useUnpaidDues: jest.fn(),
  usePaymentsThisMonth: jest.fn(),
  useLimits: jest.fn(),
}));

const q = (data: unknown, extra = {}) => ({
  data,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
  ...extra,
});

function setup() {
  (useStudents as jest.Mock).mockReturnValue(
    q([
      { id: 's1', status: 'active' },
      { id: 's2', status: 'inactive' },
    ]),
  );
  (useBatches as jest.Mock).mockReturnValue(q([]));
  (useAttendanceOn as jest.Mock).mockReturnValue(q([]));
  (useUnpaidDues as jest.Mock).mockReturnValue(q([]));
  (usePaymentsThisMonth as jest.Mock).mockReturnValue(q([]));
  (useLimits as jest.Mock).mockReturnValue(
    q({ active: true, studentLimit: null, batchLimit: null, activeStudentCount: 1, batchCount: 0 }),
  );
}

beforeEach(() => jest.clearAllMocks());

it('greets the tutor and shows zeroed numbers for a new institute', async () => {
  setup();
  await render(<HomeScreen />);
  expect(screen.getByText(/^Good (morning|afternoon|evening), Asha$/)).toBeTruthy();
  expect(screen.getByText('No classes scheduled today')).toBeTruthy();
  expect(screen.getByLabelText('Chalkpis')).toBeTruthy(); // logo, top left
});

it('has no shortcuts that repeat a tab or the menu', async () => {
  setup();
  await render(<HomeScreen />);
  for (const name of ['Mark attendance', 'Collect fee', 'Add student', 'Poster'])
    expect(screen.queryByRole('button', { name })).toBeNull();
  expect(mockNavigate).not.toHaveBeenCalled();
});

it('shows a retry when loading fails', async () => {
  setup();
  (useStudents as jest.Mock).mockReturnValue(q(undefined, { isError: true }));
  await render(<HomeScreen />);
  expect(screen.getByText('Try again')).toBeTruthy();
});
