import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../../i18n';
import { StudentsListScreen } from '../StudentsListScreen';
import { useBatches, useLimits, usePendingStudentIds, useStudents } from '../../../data/hooks';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../data/hooks', () => ({
  useStudents: jest.fn(),
  useBatches: jest.fn(),
  usePendingStudentIds: jest.fn(),
  useLimits: jest.fn(),
}));

const student = (id: string, name: string, extra = {}) => ({
  id,
  name,
  phone: '',
  parentName: '',
  parentPhone: '+919876543210',
  class: '10',
  photoUrl: null,
  batchIds: ['b1'],
  status: 'active',
  monthlyFee: 100000,
  feeCycle: 'monthly',
  dueDay: 1,
  notifyParent: true,
  joinedAt: {},
  ...extra,
});
const query = (data: unknown, extra = {}) => ({
  data,
  isLoading: false,
  isError: false,
  isRefetching: false,
  refetch: jest.fn(),
  ...extra,
});

function setup(
  students: unknown[],
  pending: string[] = [],
  limits = {
    active: true,
    studentLimit: null,
    batchLimit: null,
    activeStudentCount: students.length,
    batchCount: 1,
  },
) {
  (useStudents as jest.Mock).mockReturnValue(query(students));
  (useBatches as jest.Mock).mockReturnValue(
    query([{ id: 'b1', name: 'Maths 10', status: 'active' }]),
  );
  (usePendingStudentIds as jest.Mock).mockReturnValue(query(new Set(pending)));
  (useLimits as jest.Mock).mockReturnValue(query(limits));
}

beforeEach(() => jest.clearAllMocks());

it('lists students with the batch name and a pending-fee chip', async () => {
  setup([student('1', 'Asha Rao'), student('2', 'Bala K')], ['2']);
  await render(<StudentsListScreen />);
  expect(screen.getByText('Asha Rao')).toBeTruthy();
  expect(screen.getAllByText('Class 10 • Maths 10')).toHaveLength(2);
  expect(screen.getByText('2 students')).toBeTruthy();
});

it('uses the singular for one student', async () => {
  setup([student('1', 'Asha Rao')]);
  await render(<StudentsListScreen />);
  expect(screen.getByText('1 student')).toBeTruthy();
});

it('search narrows the list', async () => {
  setup([student('1', 'Asha Rao'), student('2', 'Bala K')]);
  await render(<StudentsListScreen />);
  await fireEvent.changeText(screen.getByLabelText('Name or phone number'), 'bala');
  expect(screen.queryByText('Asha Rao')).toBeNull();
  expect(screen.getByText('Bala K')).toBeTruthy();
});

it('fees-pending chip filters to students with dues', async () => {
  setup([student('1', 'Asha Rao'), student('2', 'Bala K')], ['2']);
  await render(<StudentsListScreen />);
  await fireEvent.press(screen.getAllByRole('button', { name: 'Fees pending' })[0]);
  expect(screen.queryByText('Asha Rao')).toBeNull();
  expect(screen.getByText('Bala K')).toBeTruthy();
});

it('shows the empty state for a new institute', async () => {
  setup([]);
  await render(<StudentsListScreen />);
  expect(screen.getByText('No students yet')).toBeTruthy();
});

it('opens a profile on tap', async () => {
  setup([student('1', 'Asha Rao')]);
  await render(<StudentsListScreen />);
  await fireEvent.press(screen.getByText('Asha Rao'));
  expect(mockNavigate).toHaveBeenCalledWith('StudentProfile', { id: '1' });
});

it('shows a retry state when loading fails', async () => {
  (useStudents as jest.Mock).mockReturnValue(query(undefined, { isError: true }));
  (useBatches as jest.Mock).mockReturnValue(query([]));
  (usePendingStudentIds as jest.Mock).mockReturnValue(query(new Set()));
  (useLimits as jest.Mock).mockReturnValue(query(undefined));
  await render(<StudentsListScreen />);
  expect(screen.getByText('Try again')).toBeTruthy();
});
