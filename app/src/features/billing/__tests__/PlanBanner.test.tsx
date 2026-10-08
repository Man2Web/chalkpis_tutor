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
  const { toJSON } = await render(<PlanBanner />);
  expect(toJSON()).toBeNull();
});

it('is hidden while limits are still loading', async () => {
  (useLimits as jest.Mock).mockReturnValue({ data: undefined });
  const { toJSON } = await render(<PlanBanner />);
  expect(toJSON()).toBeNull();
});

it('shows the trial countdown', async () => {
  set({ plan: 'trial', expiresAtMs: Date.now() + 6 * day });
  await render(<PlanBanner />);
  expect(screen.getByText('Free trial: 6 days left')).toBeTruthy();
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
