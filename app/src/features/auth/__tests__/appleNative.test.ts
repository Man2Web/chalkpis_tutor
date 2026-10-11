import * as AppleAuthentication from 'expo-apple-authentication';
import { ApiError, apiPublic } from '../../../api/client';
import { complete, startingWith } from '../phoneAuth';
import { appleNativeSignIn } from '../signIn';

// expo-apple-authentication itself is mocked for every test in jest.setup.ts
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

const pub = apiPublic as jest.Mock;
const signIn = AppleAuthentication.signInAsync as jest.Mock;
const signedIn = { accessToken: 'a', refreshToken: 'r', user: { id: 'u1', phone: null } };

beforeEach(() => {
  jest.clearAllMocks();
  pub.mockImplementation(async (_m: string, path: string) => {
    if (path === '/auth/apple/nonce') return { nonce: 'n-123' };
    if (path === '/auth/apple/native') return signedIn;
    throw new Error(`unexpected ${path}`);
  });
  (complete as jest.Mock).mockResolvedValue(null);
});

it('gets a nonce, asks Apple with it, and trades the identity token (and first-time name) for a session', async () => {
  signIn.mockResolvedValue({
    identityToken: 'jwt-1',
    fullName: { givenName: 'Priya', familyName: 'Sharma', middleName: null },
    email: 'p@privaterelay.appleid.com',
  });
  await expect(appleNativeSignIn()).resolves.toBeNull();
  expect(startingWith).toHaveBeenCalledWith('apple');
  expect(pub).toHaveBeenNthCalledWith(1, 'POST', '/auth/apple/nonce', {});
  expect(signIn).toHaveBeenCalledWith({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: 'n-123',
  });
  expect(pub).toHaveBeenNthCalledWith(2, 'POST', '/auth/apple/native', {
    identityToken: 'jwt-1',
    nonce: 'n-123',
    fullName: { givenName: 'Priya', familyName: 'Sharma' },
  });
  expect(complete).toHaveBeenCalledWith(signedIn);
});

it('sends no name on a later sign-in (Apple shares it only once)', async () => {
  signIn.mockResolvedValue({ identityToken: 'jwt-2', fullName: null, email: null });
  await appleNativeSignIn();
  expect(pub).toHaveBeenLastCalledWith('POST', '/auth/apple/native', {
    identityToken: 'jwt-2',
    nonce: 'n-123',
    fullName: null,
  });
});

it('is quietly cancelled when the person closes Apple’s sheet', async () => {
  signIn.mockRejectedValue(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
  await expect(appleNativeSignIn()).resolves.toBe('cancelled');
  expect(pub).not.toHaveBeenCalledWith('POST', '/auth/apple/native', expect.anything());
  expect(complete).not.toHaveBeenCalled();
});

it('passes on any other Apple failure', async () => {
  signIn.mockRejectedValue(Object.assign(new Error('failed'), { code: 'ERR_REQUEST_FAILED' }));
  await expect(appleNativeSignIn()).rejects.toMatchObject({ code: 'ERR_REQUEST_FAILED' });
  expect(complete).not.toHaveBeenCalled();
});

it('throws the server’s refusal (a used nonce or a bad token)', async () => {
  signIn.mockResolvedValue({ identityToken: 'jwt-3', fullName: null, email: null });
  pub.mockImplementation(async (_m: string, path: string) => {
    if (path === '/auth/apple/nonce') return { nonce: 'n-123' };
    throw new ApiError(401, 'invalid_ticket');
  });
  await expect(appleNativeSignIn()).rejects.toMatchObject({ status: 401, code: 'invalid_ticket' });
  expect(complete).not.toHaveBeenCalled();
});
