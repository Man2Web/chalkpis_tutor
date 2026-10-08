import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import { BillingScreen } from '../BillingScreen';
import { createPlanLink, mockCompletePayment } from '../api';
import { useBillingHistory, useLimits, usePaymentsAvailable } from '../../../data/hooks';
import { ApiError } from '../../../api/client';
import { open } from '../../../lib/contact';
import { toast } from '../../../components';

const mockRefresh = jest.fn().mockResolvedValue(undefined);
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../data/hooks', () => ({
  useLimits: jest.fn(),
  useBillingHistory: jest.fn(),
  usePaymentsAvailable: jest.fn(),
  useRefreshData: () => mockRefresh,
}));
jest.mock('../api', () => ({
  createPlanLink: jest.fn(),
  mockCompletePayment: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../lib/contact', () => ({ open: jest.fn().mockResolvedValue(true) }));
jest.mock('../../../lib/analytics', () => ({ reportError: jest.fn() }));
jest.mock('../../../components', () => ({
  ...jest.requireActual('../../../components'),
  toast: jest.fn(),
}));

const day = 86_400_000;
const q = (data: unknown) => ({
  data,
  isLoading: false,
  isError: false,
  isRefetching: false,
  refetch: jest.fn(),
});
const limits = (over = {}) =>
  q({
    plan: 'trial',
    status: 'active',
    expiresAtMs: Date.now() + 5 * day,
    studentLimit: null,
    batchLimit: null,
    activeStudentCount: 30,
    batchCount: 3,
    active: true,
    ...over,
  });

beforeEach(() => {
  jest.clearAllMocks();
  (useLimits as jest.Mock).mockReturnValue(limits());
  (useBillingHistory as jest.Mock).mockReturnValue(q([]));
  (usePaymentsAvailable as jest.Mock).mockReturnValue(q(true));
});

it('shows the trial, unlimited usage, and the three plans with real prices', async () => {
  await render(<BillingScreen />);
  expect(screen.getByText('Free trial')).toBeTruthy();
  expect(screen.getByText('30 (unlimited)')).toBeTruthy();
  expect(screen.getByText('₹399')).toBeTruthy();
  expect(screen.getByText('₹699')).toBeTruthy();
  expect(screen.getByText('₹999')).toBeTruthy();
  expect(screen.getByText('Up to 50 students')).toBeTruthy();
  expect(screen.getByText('Unlimited students')).toBeTruthy();
});

it('shows usage against the limit and the read-only warning when expired', async () => {
  (useLimits as jest.Mock).mockReturnValue(
    limits({
      plan: 'starter',
      status: 'expired',
      expiresAtMs: Date.now() - day,
      studentLimit: 50,
      batchLimit: 3,
      active: false,
    }),
  );
  await render(<BillingScreen />);
  expect(screen.getByText('30 / 50')).toBeTruthy();
  expect(screen.getByText('3 / 3')).toBeTruthy();
  expect(screen.getByText('Expired')).toBeTruthy();
  expect(screen.getByText(/read-only/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Choose Starter' })).toBeTruthy(); // expired: choose, not renew
});

it('an active paid plan offers Renew for itself and Choose for the others', async () => {
  (useLimits as jest.Mock).mockReturnValue(
    limits({
      plan: 'starter',
      expiresAtMs: Date.now() + 40 * day,
      studentLimit: 50,
      batchLimit: 3,
    }),
  );
  await render(<BillingScreen />);
  expect(screen.getByRole('button', { name: 'Renew Starter' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Choose Pro' })).toBeTruthy();
});

it('test mode: choosing a plan opens the test sheet, and paying activates it', async () => {
  (createPlanLink as jest.Mock).mockResolvedValue({
    url: 'mock://pay/ref1',
    referenceId: 'ref1',
    provider: 'mock',
  });
  await render(<BillingScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Choose Starter' }));
  await waitFor(() => expect(createPlanLink).toHaveBeenCalledWith('starter'));
  await fireEvent.press(await screen.findByRole('button', { name: 'Pay ₹399 (test)' }));
  await waitFor(() => expect(mockCompletePayment).toHaveBeenCalledWith('ref1'));
  await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  expect(open).not.toHaveBeenCalled();
});

it('real Razorpay: opens the payment page in the browser', async () => {
  (createPlanLink as jest.Mock).mockResolvedValue({
    url: 'https://rzp.io/i/abc',
    referenceId: 'ref2',
    provider: 'razorpay',
  });
  await render(<BillingScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Choose Pro' }));
  await waitFor(() => expect(open).toHaveBeenCalledWith('https://rzp.io/i/abc'));
  expect(await screen.findByRole('button', { name: 'I have paid — refresh' })).toBeTruthy();
  expect(mockCompletePayment).not.toHaveBeenCalled();
});

it('tells the owner plainly when online payments are not set up', async () => {
  (createPlanLink as jest.Mock).mockRejectedValue(new ApiError(503, 'billing_unavailable'));
  await render(<BillingScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Choose Starter' }));
  await waitFor(() =>
    expect(toast).toHaveBeenCalledWith(
      'Online payments are not set up yet. Please contact support.',
      'error',
    ),
  );
});

it('when online payment is off, no plan can be bought and the owner is told why', async () => {
  (usePaymentsAvailable as jest.Mock).mockReturnValue(q(false));
  await render(<BillingScreen />);
  expect(screen.getByText('Online payment is not switched on yet')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Choose Starter' })).toBeNull();
  expect(screen.queryByText('₹399')).toBeNull();
  expect(screen.getByText('Free trial')).toBeTruthy(); // the current plan is still shown
});

it('lists past payments', async () => {
  (useBillingHistory as jest.Mock).mockReturnValue(
    q([
      {
        id: 'p1',
        planId: 'starter',
        amountPaise: 39900,
        provider: 'razorpay',
        createdAt: { toDate: () => new Date('2026-10-01T05:00:00Z') },
      },
    ]),
  );
  await render(<BillingScreen />);
  expect(screen.getAllByText('Starter').length).toBeGreaterThan(1);
  expect(screen.getAllByText('₹399').length).toBe(2); // plan card + history row
});
