import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../../i18n';
import { ParentLinkCard } from '../ParentLinkCard';
import { createParentLink, getParentLinkStatus, revokeParentLinks } from '../api';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../data/hooks', () => ({
  useInstituteId: () => 'I1',
  useInstitute: () => ({ data: { name: 'Bright' } }),
}));
jest.mock('../api', () => ({
  createParentLink: jest.fn(),
  getParentLinkStatus: jest.fn(),
  revokeParentLinks: jest.fn(),
}));
jest.mock('../../../lib/analytics', () => ({ reportError: jest.fn() }));

const student = { id: 's1', name: 'Asha', parentName: 'Mr Rao', parentPhone: '+919876543210' };
const wrap = (ui: React.ReactElement) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {ui}
  </QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  (getParentLinkStatus as jest.Mock).mockResolvedValue({ active: 0, latestExpiresAt: null });
});

it('says there is no link yet, and creates one for the chosen number of days', async () => {
  (createParentLink as jest.Mock).mockResolvedValue({
    url: 'https://x.web.app/p/TOKEN',
    expiresAt: '2026-11-07T00:00:00Z',
  });
  await render(wrap(<ParentLinkCard student={student} />));
  expect(await screen.findByText('No active link')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '7 days' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Send link to parent on WhatsApp' }));
  await waitFor(() => expect(createParentLink).toHaveBeenCalledWith('s1', 7));
  expect(await screen.findByText('https://x.web.app/p/TOKEN')).toBeTruthy();
});

it('the server sends the link to the parent through the WhatsApp API', async () => {
  (createParentLink as jest.Mock).mockResolvedValue({
    url: 'https://x.web.app/p/TOKEN',
    expiresAt: '2026-11-07T00:00:00Z',
    sent: true,
  });
  await render(wrap(<ParentLinkCard student={student} />));
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Send link to parent on WhatsApp' }),
  );
  await waitFor(() => expect(createParentLink).toHaveBeenCalledWith('s1', 30));
  expect(await screen.findByText('https://x.web.app/p/TOKEN')).toBeTruthy();
});

it('shows active links and switching them off needs a confirmation', async () => {
  (getParentLinkStatus as jest.Mock).mockResolvedValue({
    active: 2,
    latestExpiresAt: '2026-11-07T00:00:00Z',
  });
  (revokeParentLinks as jest.Mock).mockResolvedValue(2);
  await render(wrap(<ParentLinkCard student={student} />));
  expect(await screen.findByText(/2 active links/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Switch off all links' }));
  expect(revokeParentLinks).not.toHaveBeenCalled(); // not yet: confirm first
  await fireEvent.press(await screen.findByRole('button', { name: 'Yes, switch off' }));
  await waitFor(() => expect(revokeParentLinks).toHaveBeenCalledWith('s1'));
});

it('the revoke button is hidden when no link is active', async () => {
  await render(wrap(<ParentLinkCard student={student} />));
  await screen.findByText('No active link');
  expect(screen.queryByRole('button', { name: 'Switch off all links' })).toBeNull();
});

it('a failed create shows nothing sensitive and no link', async () => {
  (createParentLink as jest.Mock).mockRejectedValue(new Error('boom'));
  await render(wrap(<ParentLinkCard student={student} />));
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Send link to parent on WhatsApp' }),
  );
  await waitFor(() => expect(createParentLink).toHaveBeenCalled());
  expect(screen.queryByText(/TOKEN/)).toBeNull();
});
