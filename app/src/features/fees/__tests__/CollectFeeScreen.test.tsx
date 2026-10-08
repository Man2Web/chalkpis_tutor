import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import { CollectFeeScreen } from '../CollectFeeScreen';
import { recordPayment } from '../api';
import { useDue, useStudents } from '../../../data/hooks';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../data/hooks', () => ({
  useDue: jest.fn(),
  useStudents: jest.fn(),
  useInstituteId: () => 'I1',
  useRefreshData: () => jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../api', () => ({
  recordPayment: jest.fn().mockResolvedValue({ paymentId: 'pay1', receiptNo: 'TD-00001' }),
  paidAtFor: (d: string) => ({ ymd: d }),
}));
jest.mock('../../auth/session', () => ({
  useSession: (sel: (s: { uid: string }) => unknown) => sel({ uid: 'owner1' }),
}));
jest.mock('../../../lib/analytics', () => ({ track: jest.fn(), reportError: jest.fn() }));

const q = (data: unknown) => ({ data, isLoading: false, isError: false });
const due = {
  id: 's1_2026-03',
  studentId: 's1',
  period: '2026-03',
  amount: 150000,
  discount: 0,
  paid: 0,
  status: 'pending',
  description: 'Monthly fee',
  dueDate: {},
};
const replace = jest.fn();
const navigation = { replace, goBack: jest.fn() } as never;
const route = { key: 'k', name: 'CollectFee', params: { dueId: 's1_2026-03' } } as never;

beforeEach(() => {
  jest.clearAllMocks();
  (useDue as jest.Mock).mockReturnValue(q(due));
  (useStudents as jest.Mock).mockReturnValue(q([{ id: 's1', name: 'Kavin Kumar' }]));
});

it('shows the balance and defaults the amount to the full balance', async () => {
  await render(<CollectFeeScreen navigation={navigation} route={route} />);
  expect(screen.getByText('Kavin Kumar')).toBeTruthy();
  expect(screen.getByText('Balance due: ₹1,500')).toBeTruthy();
  expect(screen.getByLabelText('Amount received (₹)').props.value).toBe('1500');
  expect(screen.getByText('This will clear the due.')).toBeTruthy();
});

it('a part payment of 1,000 leaves 500 and records exactly 1,000 in paise', async () => {
  await render(<CollectFeeScreen navigation={navigation} route={route} />);
  await fireEvent.changeText(screen.getByLabelText('Amount received (₹)'), '1000');
  expect(screen.getByText('Balance after this payment: ₹500')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'UPI' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Record payment' }));
  await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(1));
  expect(recordPayment).toHaveBeenCalledWith(
    expect.objectContaining({
      instituteId: 'I1',
      uid: 'owner1',
      dueId: 's1_2026-03',
      amount: 100000,
      mode: 'upi',
    }),
  );
  await waitFor(() => expect(replace).toHaveBeenCalledWith('Receipt', { paymentId: 'pay1' }));
});

it('refuses to take more than the balance', async () => {
  await render(<CollectFeeScreen navigation={navigation} route={route} />);
  await fireEvent.changeText(screen.getByLabelText('Amount received (₹)'), '1600');
  await fireEvent.press(screen.getByRole('button', { name: 'Record payment' }));
  expect(screen.getByText('That is more than the balance (₹1,500)')).toBeTruthy();
  expect(recordPayment).not.toHaveBeenCalled();
});

it.each(['0', 'abc', '-5', ''])('refuses the amount "%s"', async (v) => {
  await render(<CollectFeeScreen navigation={navigation} route={route} />);
  await fireEvent.changeText(screen.getByLabelText('Amount received (₹)'), v);
  await fireEvent.press(screen.getByRole('button', { name: 'Record payment' }));
  expect(screen.getByText('Enter a valid amount')).toBeTruthy();
  expect(recordPayment).not.toHaveBeenCalled();
});

it('refuses a future payment date', async () => {
  await render(<CollectFeeScreen navigation={navigation} route={route} />);
  await fireEvent.changeText(screen.getByLabelText('Payment date'), '2999-01-01');
  expect(
    screen.getByRole('button', { name: 'Record payment' }).props.accessibilityState.disabled,
  ).toBe(true);
});

it('maps a server-side overpay error to a clear message', async () => {
  (recordPayment as jest.Mock).mockRejectedValueOnce(new Error('exceeds'));
  await render(<CollectFeeScreen navigation={navigation} route={route} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Record payment' }));
  await waitFor(() =>
    expect(screen.getByText('That is more than the balance (₹1,500)')).toBeTruthy(),
  );
  expect(replace).not.toHaveBeenCalled();
});

it('a waived due cannot be paid: owes nothing', async () => {
  (useDue as jest.Mock).mockReturnValue(q({ ...due, status: 'waived' }));
  await render(<CollectFeeScreen navigation={navigation} route={route} />);
  expect(screen.getByText('Balance due: ₹0')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Record payment' }));
  expect(recordPayment).not.toHaveBeenCalled();
});
