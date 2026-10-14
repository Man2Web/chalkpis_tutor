import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import * as SecureStore from 'expo-secure-store';
import { api } from '../../../api/client';
import { AnnouncementBanner } from '../AnnouncementBanner';

jest.mock('../../../api/client', () => ({ api: jest.fn() }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));
const mockNavigate = jest.fn();
// run the "Home came into view" refresh once, as the navigator would
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(cb, []);
  },
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const ann = (id: string, title: string, more: object = {}) => ({
  id,
  title,
  body: '',
  tone: 'info',
  link: '',
  ...more,
});
/** GET /announcements answers `list`; the event posts just succeed. */
const serve = (list: object[]) =>
  (api as jest.Mock).mockImplementation((method: string) =>
    Promise.resolve(method === 'GET' ? { announcements: list } : { ok: true }),
  );
const events = () =>
  (api as jest.Mock).mock.calls
    .filter(([m, url]) => m === 'POST' && String(url).includes('/events'))
    .map(([, url, body]) => `${String(url).split('/')[2]}:${(body as { type: string }).type}`);

let client: QueryClient;
// no cache-cleanup timer (gcTime) and a cleared cache after each test, so Jest can exit straight away
afterEach(() => client.clear());

function renderBanner() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementBanner />
    </QueryClientProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

it('shows the most important announcement the tutor has not closed, and counts it as seen once', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(['a2']));
  serve([
    ann('a2', 'Closed one'),
    ann('a1', 'Poster maker'),
    ann('a3', 'Closed on the server', { dismissed: true }),
  ]);
  await renderBanner();
  expect(await screen.findByText('Poster maker')).toBeTruthy();
  expect(screen.queryByText('Closed one')).toBeNull();
  await waitFor(() => expect(events()).toEqual(['a1:seen']));
});

it('closing it hides it, remembers that on the phone and tells the server', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  serve([ann('a1', 'Poster maker', { read: true })]);
  await renderBanner();
  await fireEvent.press(await screen.findByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByText('Poster maker')).toBeNull());
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'chalkpis.dismissedAnnouncements',
    JSON.stringify(['a1']),
  );
  expect(events()).toEqual(['a1:dismissed']);
});

it('its button opens the screen it points to and counts the click', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  serve([
    ann('a1', 'Your free trial ends soon', {
      read: true,
      ctaLabel: 'See plans',
      screen: 'Billing',
    }),
  ]);
  await renderBanner();
  await fireEvent.press(await screen.findByText('See plans'));
  expect(mockNavigate).toHaveBeenCalledWith('Billing');
  await waitFor(() => expect(events()).toEqual(['a1:clicked']));
});

it('a button to a main tab goes through the tabs', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  serve([
    ann('a1', 'Mark attendance faster', { read: true, ctaLabel: 'Open', screen: 'Attendance' }),
  ]);
  await renderBanner();
  await fireEvent.press(await screen.findByText('Open'));
  expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Attendance' });
});

it('shows nothing when there is no live announcement', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  serve([]);
  await renderBanner();
  await waitFor(() => expect(api).toHaveBeenCalledWith('GET', '/announcements'));
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
});
