import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import { api } from '../../../api/client';
import { queryClient } from '../../../lib/queryClient';
import { UpdatesBell, UpdatesScreen } from '../UpdatesScreen';

jest.mock('../../../api/client', () => ({ api: jest.fn() }));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const updates = [
  {
    id: 'u1',
    title: 'Your free trial ends soon',
    body: 'Choose a plan before it ends.',
    tone: 'info',
    link: '',
    category: 'billing',
    priority: 'important',
    ctaLabel: 'See plans',
    screen: 'Billing',
    startsAt: '2026-10-14T05:00:00Z',
    read: false,
  },
  {
    id: 'u2',
    title: 'New: poster maker',
    body: '',
    tone: 'success',
    link: '',
    category: 'feature',
    priority: 'normal',
    ctaLabel: '',
    screen: '',
    startsAt: '2026-10-10T05:00:00Z',
    read: true,
  },
];
const serve = (unread = 1) =>
  (api as jest.Mock).mockImplementation((method: string, url: string) =>
    Promise.resolve(method === 'GET' && url === '/me/updates' ? { updates, unread } : { ok: true }),
  );

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
});
afterAll(() => queryClient.clear());

it('lists updates newest first; opening one marks it read and shows its button', async () => {
  serve();
  await wrap(<UpdatesScreen />);
  expect(await screen.findByText('Your free trial ends soon')).toBeTruthy();
  expect(screen.getByText('New: poster maker')).toBeTruthy();
  expect(screen.getByText('Billing · Important')).toBeTruthy();
  expect(screen.queryByText('See plans')).toBeNull(); // the button shows once opened

  await fireEvent.press(screen.getByRole('button', { name: 'Unread, Your free trial ends soon' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('POST', '/announcements/u1/events', { type: 'seen' }),
  );
  await fireEvent.press(await screen.findByText('See plans'));
  expect(mockNavigate).toHaveBeenCalledWith('Billing');
  expect(api).toHaveBeenCalledWith('POST', '/announcements/u1/events', { type: 'clicked' });
});

it('marks everything as read', async () => {
  serve();
  await wrap(<UpdatesScreen />);
  await fireEvent.press(await screen.findByText('Mark all as read'));
  await waitFor(() => expect(api).toHaveBeenCalledWith('POST', '/me/updates/read-all'));
});

it('the bell shows how many are unread and opens Updates', async () => {
  serve(3);
  await wrap(<UpdatesBell />);
  const bell = await screen.findByRole('button', { name: 'Updates, 3 unread' });
  expect(screen.getByText('3')).toBeTruthy();
  await fireEvent.press(bell);
  expect(mockNavigate).toHaveBeenCalledWith('Updates');
});

it('says so when there is nothing yet', async () => {
  (api as jest.Mock).mockResolvedValue({ updates: [], unread: 0 });
  await wrap(<UpdatesScreen />);
  expect(await screen.findByText('No updates yet')).toBeTruthy();
});
