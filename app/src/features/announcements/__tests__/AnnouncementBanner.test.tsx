import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from '../../../api/client';
import { AnnouncementBanner } from '../AnnouncementBanner';

jest.mock('../../../api/client', () => ({ api: jest.fn() }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));
// run the "Home came into view" refresh once, as the navigator would
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(cb, []);
  },
}));

const ann = (id: string, title: string) => ({ id, title, body: '', tone: 'info', link: '' });

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

it('shows the newest announcement the tutor has not closed', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(['a2']));
  (api as jest.Mock).mockResolvedValue({
    announcements: [ann('a2', 'Closed one'), ann('a1', 'Poster maker')],
  });
  await renderBanner();
  expect(await screen.findByText('Poster maker')).toBeTruthy();
  expect(screen.queryByText('Closed one')).toBeNull();
});

it('closing it hides it and remembers that on the phone', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (api as jest.Mock).mockResolvedValue({ announcements: [ann('a1', 'Poster maker')] });
  await renderBanner();
  await fireEvent.press(await screen.findByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByText('Poster maker')).toBeNull());
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'chalkpis.dismissedAnnouncements',
    JSON.stringify(['a1']),
  );
});

it('shows nothing when there is no live announcement', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (api as jest.Mock).mockResolvedValue({ announcements: [] });
  await renderBanner();
  await waitFor(() => expect(api).toHaveBeenCalledWith('GET', '/announcements'));
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
});
