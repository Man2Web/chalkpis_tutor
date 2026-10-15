import { Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import { BillingScreen } from '../BillingScreen';
import {
  checkPlanOrder,
  createPlanLink,
  mockCompletePayment,
  startAutoRenew,
  stopAutoRenew,
  syncStorePlan,
} from '../api';
import { useBillingCatalogue, useBillingHistory, useLimits } from '../../../data/hooks';
import { ApiError } from '../../../api/client';
import { open } from '../../../lib/contact';
import {
  buyOffer,
  manageStore,
  restoreStore,
  startStore,
  storeOffers,
} from '../../../lib/purchases';
import { toast } from '../../../components';

const mockRefresh = jest.fn().mockResolvedValue(undefined);
const mockNavigate = jest.fn();
jest.mock('../../../data/hooks', () => ({
  useLimits: jest.fn(),
  useBillingHistory: jest.fn(),
  useBillingCatalogue: jest.fn(),
  useInstituteId: () => 'inst-1',
  useRefreshData: () => mockRefresh,
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../api', () => ({
  createPlanLink: jest.fn(),
  mockCompletePayment: jest.fn().mockResolvedValue(undefined),
  checkPlanOrder: jest.fn().mockResolvedValue('pending'),
  syncStorePlan: jest.fn().mockResolvedValue({ state: 'store' }),
  startAutoRenew: jest.fn().mockResolvedValue({ url: 'https://rzp.io/i/sub1', startAt: null }),
  stopAutoRenew: jest.fn().mockResolvedValue({ stopped: true }),
}));
jest.mock('../../../lib/purchases', () => ({
  storeAvailable: true,
  startStore: jest.fn().mockResolvedValue(undefined),
  storeOffers: jest.fn(),
  buyOffer: jest.fn(),
  restoreStore: jest.fn().mockResolvedValue(undefined),
  manageStore: jest.fn().mockResolvedValue(undefined),
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
    cycle: null,
    status: 'active',
    expiresAtMs: Date.now() + 5 * day,
    studentLimit: null,
    batchLimit: null,
    activeStudentCount: 30,
    batchCount: 3,
    active: true,
    store: null,
    autoRenew: null,
    ...over,
  });
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    prices: { month: 19900, year: 199900 },
    studentLimit: 50,
    batchLimit: 3,
    popular: false,
  },
  {
    id: 'standard',
    name: 'Standard',
    prices: { month: 29900, year: 299900 },
    studentLimit: 100,
    batchLimit: 5,
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    prices: { month: 49900, year: 499900 },
    studentLimit: null,
    batchLimit: null,
    popular: false,
  },
];
const catalogue = (over = {}) =>
  q({
    plans: PLANS,
    popular: 'standard',
    introMonthPaise: 4900,
    paymentsAvailable: true,
    store: null,
    ...over,
  });
const offer = (
  plan: string,
  cycle: 'month' | 'year',
  price: number,
  intro: string | null = null,
) => ({
  productId: `chalkpis.${plan}.${cycle === 'month' ? 'monthly' : 'yearly'}`,
  plan,
  cycle,
  price: `₹${price.toLocaleString('en-IN')}.00`,
  amount: price,
  currency: 'INR',
  intro,
});
const OFFERS = [
  offer('starter', 'year', 1999),
  offer('standard', 'year', 2999),
  offer('pro', 'year', 4999),
  offer('starter', 'month', 199, '₹49.00'),
  offer('standard', 'month', 299, '₹49.00'),
  offer('pro', 'month', 499, '₹49.00'),
];

const show = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}
    >
      <BillingScreen />
    </QueryClientProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'web');
  (useLimits as jest.Mock).mockReturnValue(limits());
  (useBillingHistory as jest.Mock).mockReturnValue(q([]));
  (useBillingCatalogue as jest.Mock).mockReturnValue(catalogue());
  (storeOffers as jest.Mock).mockResolvedValue(OFFERS);
});

const webAuto = (over = {}) => ({
  autoRenew: {
    via: 'website',
    status: 'active',
    nextChargeAtMs: Date.parse('2026-11-15T06:00:00Z'),
    plan: 'standard',
    cycle: 'year',
    amountPaise: 299900,
    ...over,
  },
});

describe('web app: website payments', () => {
  it('shows the trial, usage, and the plans yearly first, with the popular one and a per-day price', async () => {
    await show();
    expect(screen.getByText('Free trial')).toBeTruthy();
    expect(screen.getByText('30 (unlimited)')).toBeTruthy();
    expect(screen.getByText('₹1,999')).toBeTruthy();
    expect(screen.getByText('₹2,999')).toBeTruthy();
    expect(screen.getByText('₹4,999')).toBeTruthy();
    expect(screen.getByText('Most popular')).toBeTruthy();
    expect(screen.getByText('Just ₹8 a day')).toBeTruthy();
    expect(screen.getByText('Up to 50 students')).toBeTruthy();
    expect(screen.getByText('Unlimited students')).toBeTruthy();
    await fireEvent.press(screen.getByText('Monthly'));
    expect(await screen.findByText('₹199')).toBeTruthy();
    expect(screen.getByText('₹499')).toBeTruthy();
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
    await show();
    expect(screen.getByText('30 / 50')).toBeTruthy();
    expect(screen.getByText('3 / 3')).toBeTruthy();
    expect(screen.getByText('Expired')).toBeTruthy();
    expect(screen.getByText(/read-only/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start ₹1,999 / year' })).toBeTruthy();
  });

  it('every plan starts as auto-renew (first payment when the trial ends); yearly can also be paid once', async () => {
    await show();
    expect(screen.getByText(/the first payment is taken when the trial ends/)).toBeTruthy();
    expect(screen.getAllByText('or pay once for 1 year (no auto-renew)')).toHaveLength(3);
    await fireEvent.press(screen.getByRole('button', { name: 'Start ₹2,999 / year' }));
    await waitFor(() => expect(startAutoRenew).toHaveBeenCalledWith('standard', 'year'));
    expect(open).toHaveBeenCalledWith('https://rzp.io/i/sub1');
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Approve UPI Autopay'));
    // monthly is auto-renew only
    await fireEvent.press(screen.getByText('Monthly'));
    expect(await screen.findByRole('button', { name: 'Start ₹299 / month' })).toBeTruthy();
    expect(screen.queryByText('or pay once for 1 year (no auto-renew)')).toBeNull();
  });

  it('with auto-renew on: when it renews, the current plan, upgrades, and turning it off', async () => {
    (useLimits as jest.Mock).mockReturnValue(
      limits({
        plan: 'standard',
        cycle: 'year',
        expiresAtMs: Date.now() + 200 * day,
        ...webAuto(),
      }),
    );
    await show();
    expect(screen.getByText(/Renews automatically on/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Your current plan' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'At renewal' })).toBeTruthy(); // Starter is lower
    expect(screen.queryByText('or pay once for 1 year (no auto-renew)')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Upgrade · ₹4,999 / year' }));
    await waitFor(() => expect(startAutoRenew).toHaveBeenCalledWith('pro', 'year'));
    await fireEvent.press(screen.getByRole('button', { name: 'Turn off auto-renew' }));
    await waitFor(() => expect(stopAutoRenew).toHaveBeenCalled());
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('a failed automatic payment is shown', async () => {
    (useLimits as jest.Mock).mockReturnValue(
      limits({ plan: 'standard', cycle: 'year', ...webAuto({ status: 'pending' }) }),
    );
    await show();
    expect(screen.getByText(/did not go through/)).toBeTruthy();
  });

  it('test mode: choosing a plan opens the test sheet for that cycle, and paying activates it', async () => {
    (createPlanLink as jest.Mock).mockResolvedValue({
      url: 'mock://pay/ref1',
      referenceId: 'ref1',
      provider: 'mock',
    });
    await show();
    await fireEvent.press(screen.getAllByText('or pay once for 1 year (no auto-renew)')[0]!);
    await waitFor(() =>
      expect(createPlanLink).toHaveBeenCalledWith('starter', 'year', {
        idempotencyKey: expect.stringMatching(/-starter-year$/),
      }),
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Pay ₹1,999 (test)' }));
    await waitFor(() => expect(mockCompletePayment).toHaveBeenCalledWith('ref1'));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(open).not.toHaveBeenCalled();
  });

  it('Razorpay: opens the payment page and switches the plan on once the server confirms', async () => {
    (createPlanLink as jest.Mock).mockResolvedValue({
      url: 'https://rzp.io/i/abc',
      referenceId: 'ref3',
      provider: 'gateway',
    });
    await show();
    await fireEvent.press(screen.getAllByText('or pay once for 1 year (no auto-renew)')[2]!);
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://rzp.io/i/abc'));
    (checkPlanOrder as jest.Mock).mockResolvedValueOnce('pending').mockResolvedValueOnce('paid');
    await fireEvent.press(await screen.findByRole('button', { name: 'I have paid, check now' }));
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Still waiting'));
    await fireEvent.press(screen.getByRole('button', { name: 'I have paid, check now' }));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(checkPlanOrder).toHaveBeenCalledWith('ref3');
    expect(mockCompletePayment).not.toHaveBeenCalled();
  });

  it('tells the owner plainly when online payments are not set up', async () => {
    (createPlanLink as jest.Mock).mockRejectedValue(new ApiError(503, 'billing_unavailable'));
    await show();
    await fireEvent.press(screen.getAllByText('or pay once for 1 year (no auto-renew)')[0]!);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        'Online payments are not set up yet. Please contact support.',
        'error',
      ),
    );
  });

  it('when online payment is off, no plan can be bought and the owner is told why', async () => {
    (useBillingCatalogue as jest.Mock).mockReturnValue(catalogue({ paymentsAvailable: false }));
    await show();
    expect(screen.getByText('About your plan')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start ₹1,999 / year' })).toBeNull();
    expect(screen.getByText('Free trial')).toBeTruthy();
  });

  it('lists past payments, with the cycle, the store and refunds', async () => {
    (useBillingHistory as jest.Mock).mockReturnValue(
      q([
        {
          id: 'p1',
          planId: 'starter',
          cycle: 'month',
          amountPaise: 19900,
          currency: 'INR',
          refunded: false,
          provider: 'razorpay',
          createdAt: { toDate: () => new Date('2026-10-01T05:00:00Z') },
        },
        {
          id: 'p2',
          planId: 'pro',
          cycle: 'year',
          amountPaise: 499900,
          currency: 'INR',
          refunded: true,
          provider: 'apple',
          createdAt: { toDate: () => new Date('2026-09-01T05:00:00Z') },
        },
      ]),
    );
    await show();
    expect(screen.getByText('Starter · Monthly')).toBeTruthy();
    expect(screen.getByText('₹199')).toBeTruthy();
    expect(screen.getByText(/App Store/)).toBeTruthy();
    expect(screen.getByText('Refunded')).toBeTruthy();
  });
});

describe.each(['ios', 'android'] as const)('%s app: store subscriptions', (os) => {
  const withStore = () =>
    (useBillingCatalogue as jest.Mock).mockReturnValue(
      catalogue({ store: { ios: 'appl_key', android: 'goog_key' } }),
    );
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', os);
  });

  it('without store keys from the server it sells nothing and shows the plan only', async () => {
    await show();
    expect(screen.getByText('About your plan')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Subscribe' })).toBeNull();
    expect(startStore).not.toHaveBeenCalled();
  });

  it('shows the store prices, the ₹49 first month, the renewal terms and Restore', async () => {
    withStore();
    await show();
    expect(await screen.findByText('₹2,999.00')).toBeTruthy();
    expect(startStore).toHaveBeenCalledWith(os === 'ios' ? 'appl_key' : 'goog_key', 'inst-1');
    expect(screen.getAllByRole('button', { name: 'Subscribe' })).toHaveLength(3);
    expect(screen.getByText(/renew automatically at the price shown/)).toBeTruthy();
    expect(screen.getByText(/free days left are kept/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Terms of use'));
    expect(mockNavigate).toHaveBeenCalledWith('Legal', { doc: 'terms' });
    await fireEvent.press(screen.getByText('Monthly'));
    expect(
      await screen.findByText('₹49.00 for the first month, then ₹299.00 a month'),
    ).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Start for ₹49.00' })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Restore purchases' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Manage subscription' })).toBeNull();
  });

  it('subscribing opens the store, then the server switches the plan on', async () => {
    withStore();
    (buyOffer as jest.Mock).mockResolvedValue('done');
    await show();
    await screen.findByText('₹2,999.00');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Subscribe' })[1]!);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Plan activated', 'success'));
    expect(buyOffer).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'chalkpis.standard.yearly' }),
      null,
    );
    expect(syncStorePlan).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('a closed store sheet says nothing; a pending payment says it will switch on by itself', async () => {
    withStore();
    (buyOffer as jest.Mock).mockResolvedValueOnce('cancelled').mockResolvedValueOnce('pending');
    await show();
    await screen.findByText('₹2,999.00');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Subscribe' })[0]!);
    await waitFor(() => expect(buyOffer).toHaveBeenCalledTimes(1));
    expect(toast).not.toHaveBeenCalled();
    expect(syncStorePlan).not.toHaveBeenCalled();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Subscribe' })[0]!);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('waiting for confirmation')),
    );
  });

  it('with a store subscription: renews-on line, the current plan, switching, and Manage', async () => {
    withStore();
    (useLimits as jest.Mock).mockReturnValue(
      limits({
        plan: 'standard',
        cycle: 'year',
        expiresAtMs: Date.now() + 200 * day,
        studentLimit: 100,
        batchLimit: 5,
        store: {
          name: os === 'ios' ? 'app_store' : 'play_store',
          product: 'chalkpis.standard.yearly',
          willRenew: true,
          issue: 'billing',
          thenUntilMs: Date.now() + 207 * day,
        },
      }),
    );
    (buyOffer as jest.Mock).mockResolvedValue('done');
    await show();
    await screen.findByText('₹2,999.00');
    expect(
      screen.getByText(new RegExp(`through ${os === 'ios' ? 'the App Store' : 'Google Play'}`)),
    ).toBeTruthy();
    expect(screen.getByText(/Payment problem/)).toBeTruthy();
    expect(screen.getByText(/Your earlier days continue/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Your current plan' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Switch to Pro' }));
    await waitFor(() =>
      expect(buyOffer).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'chalkpis.pro.yearly' }),
        'chalkpis.standard.yearly',
      ),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Manage subscription' }));
    expect(manageStore).toHaveBeenCalled();
  });

  it('with auto-renew on the website it sells nothing in the app and shows when it renews', async () => {
    withStore();
    (useLimits as jest.Mock).mockReturnValue(
      limits({ plan: 'standard', cycle: 'year', ...webAuto() }),
    );
    await show();
    expect(screen.getByText(/Renews automatically on/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Subscribe' })).toBeNull();
    expect(screen.queryByText(/UPI/)).toBeNull();
  });

  it('Restore purchases asks the store, then the server', async () => {
    withStore();
    (syncStorePlan as jest.Mock).mockResolvedValueOnce({ state: 'none' });
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: 'Restore purchases' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('No subscription found on this account'),
    );
    expect(restoreStore).toHaveBeenCalled();
  });
});
