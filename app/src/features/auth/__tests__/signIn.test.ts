import * as WebBrowser from 'expo-web-browser';
import { ApiError, apiPublic } from '../../../api/client';
import { authErrorKey } from '../authErrors';
import { complete } from '../phoneAuth';
import { oauthSignIn } from '../signIn';

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('expo-linking', () => ({ createURL: () => 'chalkpis://auth' }));
jest.mock('../../../api/client', () => ({
  ...jest.requireActual('../../../api/client'),
  apiPublic: jest.fn(),
}));
jest.mock('../phoneAuth', () => ({
  startingWith: jest.fn(),
  complete: jest.fn(),
}));

const open = WebBrowser.openAuthSessionAsync as jest.Mock;
const pub = apiPublic as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  pub.mockImplementation(async (_m: string, path: string) => {
    if (path.endsWith('/begin'))
      return { url: 'https://api.test/auth/oauth/google/start?state=s1', secret: 'sec-1' };
    if (path === '/auth/ticket') return { ok: true };
    throw new Error(`unexpected ${path}`);
  });
  (complete as jest.Mock).mockResolvedValue(null);
});

describe('oauthSignIn', () => {
  it('asks the server to begin, opens its address, and redeems the ticket with the secret', async () => {
    open.mockResolvedValue({ type: 'success', url: 'chalkpis://auth?ticket=T1' });
    await expect(oauthSignIn('google')).resolves.toBeNull();
    expect(pub).toHaveBeenNthCalledWith(1, 'POST', '/auth/oauth/google/begin', {
      redirect: 'chalkpis://auth',
    });
    expect(open).toHaveBeenCalledWith(
      'https://api.test/auth/oauth/google/start?state=s1',
      'chalkpis://auth',
    );
    expect(pub).toHaveBeenNthCalledWith(2, 'POST', '/auth/ticket', {
      ticket: 'T1',
      secret: 'sec-1',
    });
    expect(complete).toHaveBeenCalledWith({ ok: true });
  });

  it('never opens the old GET /start address directly', async () => {
    open.mockResolvedValue({ type: 'cancel' });
    await oauthSignIn('apple');
    expect(pub).toHaveBeenCalledWith('POST', '/auth/oauth/apple/begin', expect.anything());
    expect(open.mock.calls[0][0]).not.toContain('redirect=');
  });

  it('is cancelled when the sheet is closed or the provider says cancelled', async () => {
    open.mockResolvedValueOnce({ type: 'cancel' });
    await expect(oauthSignIn('google')).resolves.toBe('cancelled');
    open.mockResolvedValueOnce({ type: 'success', url: 'chalkpis://auth?error=cancelled' });
    await expect(oauthSignIn('google')).resolves.toBe('cancelled');
    expect(pub).not.toHaveBeenCalledWith('POST', '/auth/ticket', expect.anything());
  });

  it('throws the server reason when no ticket comes back (shown as the provider-failed toast)', async () => {
    open.mockResolvedValue({ type: 'success', url: 'chalkpis://auth?error=bad_binding' });
    const e = await oauthSignIn('google').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).code).toBe('bad_binding');
    expect(authErrorKey(e)).toBe('generic');
  });

  it('does not open the browser when begin fails (an old server, or none)', async () => {
    pub.mockRejectedValueOnce(new ApiError(0, 'network'));
    await expect(oauthSignIn('google')).rejects.toMatchObject({ status: 0 });
    expect(open).not.toHaveBeenCalled();
  });
});

describe('authErrorKey for the new server answers', () => {
  it.each([
    [400, 'bad_binding', 'generic'],
    [410, 'update_required', 'generic'],
    [429, 'Too Many Requests', 'tooMany'],
    [429, 'something_new', 'tooMany'],
    [429, 'invalid_phone', 'invalidPhone'],
  ])('%s %s -> %s', (status, code, key) =>
    expect(authErrorKey(new ApiError(status, code))).toBe(key),
  );
});
