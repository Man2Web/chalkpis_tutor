import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../../i18n';
import { MessageLogScreen } from '../MessageLogScreen';
import { useMessages, useStudents } from '../../../data/hooks';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../data/hooks', () => ({ useMessages: jest.fn(), useStudents: jest.fn() }));

const ts = { toDate: () => new Date('2026-10-08T05:00:00Z') };
const q = (data: unknown, extra = {}) => ({
  data,
  isLoading: false,
  isError: false,
  isRefetching: false,
  refetch: jest.fn(),
  ...extra,
});
const msg = (id: string, studentId: string, status: string, extra = {}) => ({
  id,
  studentId,
  type: 'absent',
  channel: 'whatsapp',
  status,
  createdAt: ts,
  ...extra,
});

beforeEach(() => {
  (useStudents as jest.Mock).mockReturnValue(
    q([
      { id: 's1', name: 'Asha Rao' },
      { id: 's2', name: 'Bala K' },
      { id: 's3', name: 'Cee D' },
    ]),
  );
});

it('lists messages with a readable status and reason', async () => {
  (useMessages as jest.Mock).mockReturnValue(
    q([
      msg('1', 's1', 'sent'),
      msg('2', 's2', 'skipped', { reason: 'not-configured' }),
      msg('3', 's3', 'failed', { error: 'http-401' }),
    ]),
  );
  await render(<MessageLogScreen />);
  expect(screen.getByText('Asha Rao')).toBeTruthy();
  expect(screen.getByText('Sent')).toBeTruthy();
  expect(screen.getByText(/WhatsApp is not set up yet/)).toBeTruthy();
  expect(screen.getByText(/http-401/)).toBeTruthy();
});

it('filters to failed messages', async () => {
  (useMessages as jest.Mock).mockReturnValue(
    q([msg('1', 's1', 'sent'), msg('3', 's3', 'failed', { error: 'http-401' })]),
  );
  await render(<MessageLogScreen />);
  await fireEvent.press(screen.getAllByRole('button', { name: 'Failed' })[0]);
  expect(screen.queryByText('Asha Rao')).toBeNull();
  expect(screen.getByText('Cee D')).toBeTruthy();
});

it('shows an empty state before anything is sent', async () => {
  (useMessages as jest.Mock).mockReturnValue(q([]));
  await render(<MessageLogScreen />);
  expect(screen.getByText('No messages yet')).toBeTruthy();
});

it('offers a retry when loading fails', async () => {
  (useMessages as jest.Mock).mockReturnValue(q(undefined, { isError: true }));
  await render(<MessageLogScreen />);
  expect(screen.getByText('Try again')).toBeTruthy();
});
