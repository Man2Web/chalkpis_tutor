import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../../i18n';
import { PlanBanner } from '../PlanBanner';
import { useLimits } from '../../../data/hooks';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../../../data/hooks', () => ({ useLimits: jest.fn() }));

const day = 86_400_000;
const set = (over: object) =>
  (useLimits as jest.Mock).mockReturnValue({
    data: {
      plan: 'starter',
      status: 'active',
      expiresAtMs: Date.now() + 40 * day,
      studentLimit: 50,
      batchLimit: 3,
      ...over,
    },
  });

beforeEach(() => jest.clearAllMocks());

it('is hidden for a healthy paid plan', async () => {
  set({});
  await render(<PlanBanner />);
  expect(screen.queryByRole('button')).toBeNull();
});

it('is hidden while limits are still loading', async () => {
  (useLimits as jest.Mock).mockReturnValue({ data: undefined });
  await render(<PlanBanner />);
  expect(screen.queryByRole('button')).toBeNull();
});

it('stays out of the way while a trial simply runs (the plan is in the Account tab)', async () => {
  set({ plan: 'trial', expiresAtMs: Date.now() + 6 * day });
  await render(<PlanBanner />);
  expect(screen.queryByRole('button')).toBeNull();
});

it('warns when a plan is about to end', async () => {
  set({ expiresAtMs: Date.now() + 2 * day - 1000 });
  await render(<PlanBanner />);
  expect(screen.getByText('Your plan ends in 2 days')).toBeTruthy();
});

it('says the app is read-only once the plan has ended', async () => {
  set({ status: 'expired', expiresAtMs: Date.now() - day });
  await render(<PlanBanner />);
  expect(
    screen.getByText('Your plan has ended. The app is read-only until you renew.'),
  ).toBeTruthy();
});

it('tapping goes to Plans & billing', async () => {
  set({ plan: 'trial', expiresAtMs: Date.now() + 2 * day });
  await render(<PlanBanner />);
  await fireEvent.press(screen.getByRole('button'));
  expect(mockNavigate).toHaveBeenCalledWith('Billing');
});

it('a store subscription that renews by itself is not "ending"', async () => {
  set({
    expiresAtMs: Date.now() + 2 * day,
    store: { name: 'app_store', willRenew: true, issue: null },
  });
  await render(<PlanBanner />);
  expect(screen.queryByRole('button')).toBeNull();
});

it('a store payment problem asks the owner to fix it in the store', async () => {
  set({ store: { name: 'play_store', willRenew: true, issue: 'billing' } });
  await render(<PlanBanner />);
  expect(
    screen.getByText(
      'Payment problem: update your payment method in Google Play to keep your plan',
    ),
  ).toBeTruthy();
});
