import { api } from '../../../api/client';
import { tokens } from '../../../api/tokens';
import { queryClient } from '../../../lib/queryClient';
import { logout, useSession } from '../session';

jest.mock('../../../api/client', () => ({
  ...jest.requireActual('../../../api/client'),
  api: jest.fn(),
}));
jest.mock('../../../api/tokens', () => ({
  tokens: { getRefresh: jest.fn(), clear: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  (tokens.getRefresh as jest.Mock).mockResolvedValue('ref');
  (tokens.clear as jest.Mock).mockResolvedValue(undefined);
  useSession.getState().set({ uid: 'u1', status: 'ready' });
});

describe('logout', () => {
  it('forgets everything the last person loaded', async () => {
    (api as jest.Mock).mockResolvedValue(undefined);
    queryClient.setQueryData(['students', 'I1'], [{ id: 's1' }]);
    await logout();
    expect(queryClient.getQueryData(['students', 'I1'])).toBeUndefined();
    expect(useSession.getState().status).toBe('signedOut');
    expect(tokens.clear).toHaveBeenCalled();
  });

  it('a second tap joins the first instead of signing out twice', async () => {
    let done: () => void = () => undefined;
    (api as jest.Mock).mockImplementation(() => new Promise<void>((r) => (done = () => r())));
    const a = logout();
    const b = logout();
    while (!(api as jest.Mock).mock.calls.length) await Promise.resolve();
    done();
    await Promise.all([a, b]);
    expect(api).toHaveBeenCalledTimes(1);
    expect(tokens.clear).toHaveBeenCalledTimes(1);
  });

  it('still signs out here when the server cannot be reached', async () => {
    (api as jest.Mock).mockRejectedValue(new Error('network'));
    await logout();
    expect(useSession.getState().status).toBe('signedOut');
  });
});
