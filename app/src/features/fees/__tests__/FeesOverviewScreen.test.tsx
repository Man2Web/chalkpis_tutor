import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../../i18n';
import { FeesOverviewScreen } from '../FeesOverviewScreen';
import { usePaymentsThisMonth, useStudents, useUnpaidDues } from '../../../data/hooks';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../FeesHistoryCard', () => ({ FeesHistoryCard: () => null }));
jest.mock('../../../data/hooks', () => ({
  useInstitute: () => ({ data: { name: 'X', upiId: 'sir@upi', receiptPrefix: 'TD' } }),
  useUnpaidDues: jest.fn(),
  useStudents: jest.fn(),
  usePaymentsThisMonth: jest.fn(),
}));

const q = (data: unknown, extra = {}) => ({
  data,
  isLoading: false,
  isError: false,
  isRefetching: false,
  refetch: jest.fn(),
  ...extra,
});
const ts = (iso: string) => ({
  toDate: () => new Date(`${iso}T00:00:00+05:30`),
  toMillis: () => Date.parse(`${iso}T00:00:00+05:30`),
});
const due = (id: string, studentId: string, dueOn: string, extra = {}) => ({
  id,
  studentId,
  period: dueOn.slice(0, 7),
  amount: 150000,
  discount: 0,
  paid: 0,
  status: 'pending',
  description: 'Monthly fee',
  dueDate: ts(dueOn),
  ...extra,
});

function setup(dues: unknown[]) {
  (useUnpaidDues as jest.Mock).mockReturnValue(q(dues));
  (useStudents as jest.Mock).mockReturnValue(
    q([
      { id: 'a', name: 'Asha Rao', photoUrl: null },
      { id: 'b', name: 'Bala K', photoUrl: null },
    ]),
  );
  (usePaymentsThisMonth as jest.Mock).mockReturnValue(q([{ amount: 100000 }, { amount: -30000 }]));
}

beforeEach(() => jest.clearAllMocks());

it('totals pending, overdue, and net collected this month', async () => {
  setup([
    due('a1', 'a', '2020-01-05'),
    due('b1', 'b', '2999-01-05', { amount: 100000, paid: 40000, status: 'partial' }),
  ]);
  await render(<FeesOverviewScreen />);
  expect(screen.getByText('₹2,100')).toBeTruthy(); // 1,500 + (1,000 - 400)
  expect(screen.getAllByText('₹1,500')).toHaveLength(2); // overdue card + Asha's row (only Asha is overdue)
  expect(screen.getByText('₹700')).toBeTruthy(); // 1,000 collected - 300 reversed
});

it('lists overdue students first and filters to overdue', async () => {
  setup([due('b1', 'b', '2999-01-05'), due('a1', 'a', '2020-01-05')]);
  await render(<FeesOverviewScreen />);
  const names = screen.getAllByText(/Asha Rao|Bala K/).map((n) => n.props.children);
  expect(names).toEqual(['Asha Rao', 'Bala K']);
  await fireEvent.press(screen.getByRole('tab', { name: 'Overdue' }));
  expect(screen.queryByText('Bala K')).toBeNull();
});

it('one due goes straight to Collect; several go to the ledger', async () => {
  setup([due('a1', 'a', '2020-01-05'), due('b1', 'b', '2020-02-05'), due('b2', 'b', '2020-03-05')]);
  await render(<FeesOverviewScreen />);
  await fireEvent.press(screen.getByText('Asha Rao'));
  expect(mockNavigate).toHaveBeenCalledWith('CollectFee', { dueId: 'a1' });
  await fireEvent.press(screen.getByText('Bala K'));
  expect(mockNavigate).toHaveBeenCalledWith('FeeLedger', { studentId: 'b' });
});

it('shows the all-clear state', async () => {
  setup([]);
  await render(<FeesOverviewScreen />);
  expect(screen.getByText('No fees pending')).toBeTruthy();
});

it('Remind opens the composer', async () => {
  setup([due('a1', 'a', '2020-01-05')]);
  await render(<FeesOverviewScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Remind' }));
  expect(mockNavigate).toHaveBeenCalledWith('Reminder', { studentId: 'a' });
});
