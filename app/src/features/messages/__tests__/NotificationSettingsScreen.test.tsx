import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import { NotificationSettingsScreen } from '../NotificationSettingsScreen';
import { saveNotifySettings } from '../api';
import { useNotifySettings } from '../../../data/hooks';
import { DEFAULT_SETTINGS } from '../settings';

const mockRefresh = jest.fn().mockResolvedValue(undefined);
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../data/hooks', () => ({
  useNotifySettings: jest.fn(),
  useInstituteId: () => 'I1',
  useRefreshData: () => mockRefresh,
}));
jest.mock('../api', () => ({ saveNotifySettings: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../lib/analytics', () => ({ reportError: jest.fn() }));

const q = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: jest.fn() });
const set = (over = {}) =>
  (useNotifySettings as jest.Mock).mockReturnValue(q({ ...DEFAULT_SETTINGS, ...over }));

beforeEach(() => {
  jest.clearAllMocks();
  set();
});

it('everything below the master switch is disabled while messages are off', async () => {
  await render(<NotificationSettingsScreen />);
  expect(screen.getByLabelText('Send messages to parents').props.value).toBe(false);
  expect(screen.getByLabelText('A student is marked absent').props.disabled).toBe(true);
  expect(
    screen.getByLabelText('Days before the due date +').props.accessibilityState?.disabled,
  ).toBe(true);
});

it('turning the master switch on saves it', async () => {
  await render(<NotificationSettingsScreen />);
  await fireEvent(screen.getByLabelText('Send messages to parents'), 'valueChange', true);
  await waitFor(() => expect(saveNotifySettings).toHaveBeenCalledWith('I1', { enabled: true }));
  expect(mockRefresh).toHaveBeenCalled();
});

it('each switch saves just its own choice', async () => {
  set({ enabled: true });
  await render(<NotificationSettingsScreen />);
  await fireEvent(screen.getByLabelText('A student is marked late'), 'valueChange', false);
  await waitFor(() => expect(saveNotifySettings).toHaveBeenCalledWith('I1', { late: false }));
  await fireEvent(screen.getByLabelText('A payment is recorded'), 'valueChange', false);
  await waitFor(() =>
    expect(saveNotifySettings).toHaveBeenCalledWith('I1', { paymentReceived: false }),
  );
});

it('steppers move by one and stop at the limits', async () => {
  set({ enabled: true, feeDueDaysBefore: 15, overdueEveryDays: 1 });
  await render(<NotificationSettingsScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Days before the due date +' }));
  await waitFor(() =>
    expect(saveNotifySettings).toHaveBeenCalledWith('I1', { feeDueDaysBefore: 15 }),
  ); // clamped
  await fireEvent.press(screen.getByRole('button', { name: 'Repeat every (days) −' }));
  await waitFor(() =>
    expect(saveNotifySettings).toHaveBeenCalledWith('I1', { overdueEveryDays: 1 }),
  ); // clamped
  await fireEvent.press(screen.getByRole('button', { name: 'Days before the due date −' }));
  await waitFor(() =>
    expect(saveNotifySettings).toHaveBeenCalledWith('I1', { feeDueDaysBefore: 14 }),
  );
});
