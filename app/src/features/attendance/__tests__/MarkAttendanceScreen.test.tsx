import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import { MarkAttendanceScreen } from '../MarkAttendanceScreen';
import { saveAttendance } from '../api';
import { useAttendanceDoc, useBatches, useStudents } from '../../../data/hooks';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../data/hooks', () => ({
  useStudents: jest.fn(),
  useBatches: jest.fn(),
  useAttendanceDoc: jest.fn(),
  useInstituteId: () => 'I1',
  useRefreshData: () => jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../api', () => ({ saveAttendance: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../auth/session', () => ({
  useSession: (sel: (s: { uid: string }) => unknown) => sel({ uid: 'owner1' }),
}));
jest.mock('../../../lib/analytics', () => ({ track: jest.fn(), reportError: jest.fn() }));

const q = (data: unknown) => ({ data, isLoading: false, isError: false });
const joined = { toDate: () => new Date('2026-01-01T10:00:00+05:30') };
const student = (id: string, name: string) => ({
  id,
  name,
  phone: '',
  parentName: '',
  parentPhone: '+919876543210',
  class: '10',
  photoUrl: null,
  batchIds: ['b1'],
  status: 'active',
  monthlyFee: 0,
  feeCycle: 'monthly',
  dueDay: 1,
  notifyParent: true,
  joinedAt: joined,
});
const navigation = { goBack: jest.fn() } as never;
const route = {
  key: 'k',
  name: 'MarkAttendance',
  params: { batchId: 'b1', date: '2026-03-05' },
} as never;

function setup(saved: unknown = null, count = 3) {
  (useStudents as jest.Mock).mockReturnValue(
    q(Array.from({ length: count }, (_, i) => student(`s${i}`, `Student ${i}`))),
  );
  (useBatches as jest.Mock).mockReturnValue(q([{ id: 'b1', name: 'Maths 10', status: 'active' }]));
  (useAttendanceDoc as jest.Mock).mockReturnValue(q(saved));
}

beforeEach(() => jest.clearAllMocks());

it('opens with everyone Present', async () => {
  setup();
  await render(<MarkAttendanceScreen navigation={navigation} route={route} />);
  expect(screen.getByText('Present 3')).toBeTruthy();
  expect(screen.getByText('Absent 0')).toBeTruthy();
});

it('one tap marks a student Absent, and saves the whole day in one write', async () => {
  setup();
  await render(<MarkAttendanceScreen navigation={navigation} route={route} />);
  await fireEvent.press(screen.getByLabelText('Student 1, Present'));
  expect(screen.getByText('Absent 1')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saveAttendance).toHaveBeenCalledTimes(1));
  expect(saveAttendance).toHaveBeenCalledWith(
    expect.objectContaining({
      instituteId: 'I1',
      uid: 'owner1',
      batchId: 'b1',
      date: '2026-03-05',
      marks: { s0: 'P', s1: 'A', s2: 'P' },
      holiday: undefined,
    }),
  );
});

it('tapping again cycles Absent -> Late -> Present', async () => {
  setup();
  await render(<MarkAttendanceScreen navigation={navigation} route={route} />);
  await fireEvent.press(screen.getByLabelText('Student 0, Present'));
  await fireEvent.press(screen.getByLabelText('Student 0, Absent'));
  expect(screen.getByText('Late 1')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Student 0, Late'));
  expect(screen.getByText('Present 3')).toBeTruthy();
});

it('Mark all present resets edits', async () => {
  setup();
  await render(<MarkAttendanceScreen navigation={navigation} route={route} />);
  await fireEvent.press(screen.getByLabelText('Student 0, Present'));
  await fireEvent.press(screen.getByLabelText('Student 1, Present'));
  expect(screen.getByText('Absent 2')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Mark all present' }));
  expect(screen.getByText('Absent 0')).toBeTruthy();
});

it('shows saved marks when editing a past day', async () => {
  setup({
    id: 'b1_20260305',
    batchId: 'b1',
    date: '2026-03-05',
    marks: { s0: 'A', s1: 'L', s2: 'P' },
  });
  await render(<MarkAttendanceScreen navigation={navigation} route={route} />);
  expect(screen.getByLabelText('Student 0, Absent')).toBeTruthy();
  expect(screen.getByLabelText('Student 1, Late')).toBeTruthy();
});

it('saves a holiday with no marks', async () => {
  setup();
  await render(<MarkAttendanceScreen navigation={navigation} route={route} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Holiday' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Class cancelled' }));
  expect(screen.getByText('Marked as class cancelled')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saveAttendance).toHaveBeenCalled());
  expect(saveAttendance).toHaveBeenCalledWith(expect.objectContaining({ holiday: 'cancelled' }));
});

it('handles a 100-student batch', async () => {
  setup(null, 100);
  await render(<MarkAttendanceScreen navigation={navigation} route={route} />);
  expect(screen.getByText('Present 100')).toBeTruthy();
});

it('refuses future dates', async () => {
  setup();
  const future = {
    key: 'k',
    name: 'MarkAttendance',
    params: { batchId: 'b1', date: '2999-01-01' },
  } as never;
  await render(<MarkAttendanceScreen navigation={navigation} route={future} />);
  expect(screen.getByText('You cannot mark attendance for a future date.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(true);
});
