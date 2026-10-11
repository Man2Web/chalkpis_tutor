import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { ApiError, apiPublic } from '../../api/client';
import { complete, startingWith, type NeedsPhone } from './phoneAuth';

export interface Methods {
  whatsapp: boolean;
  email: boolean;
  google: boolean;
  apple: boolean;
}

/** Which sign-in buttons to show; if the server cannot be reached, WhatsApp (always set up) is offered alone. */
export async function signInMethods(): Promise<Methods> {
  try {
    return await apiPublic<Methods>('GET', '/auth/methods');
  } catch {
    return { whatsapp: true, email: false, google: false, apple: false };
  }
}

let devEmailCode: { email: string; code: string } | null = null;
/** Test mode only: the server returns the code when it runs with OTP_DEV_ECHO (never in production). */
export const devEmailCodeFor = (email: string) =>
  devEmailCode?.email === email ? devEmailCode.code : null;

/** Emails a 6-digit sign-in code; returns the address as the server normalised it. */
export async function sendEmailCode(rawEmail: string): Promise<string> {
  startingWith('email');
  const r = await apiPublic<{ email: string; devCode?: string }>('POST', '/auth/email/request', {
    email: rawEmail.trim(),
  });
  devEmailCode = r.devCode ? { email: r.email, code: r.devCode } : null;
  return r.email;
}

/** Checks the email code: signs in, or returns what is needed to add a mobile number. */
export async function confirmEmailCode(email: string, code: string): Promise<NeedsPhone | null> {
  return complete(await apiPublic('POST', '/auth/email/verify', { email, code: code.trim() }));
}

WebBrowser.maybeCompleteAuthSession();

/**
 * Sign in with Google or Apple: our server runs the provider's sign-in in a secure browser sheet and sends the
 * person back to the app with a one-time ticket, which is traded here for a session. The server first hands this
 * app a secret along with the sign-in address; the ticket only works together with that secret, so a ticket caught
 * on its way back (another app claiming the link) is useless. 'cancelled' when the person backed out.
 */
export async function oauthSignIn(
  provider: 'google' | 'apple',
): Promise<NeedsPhone | null | 'cancelled'> {
  startingWith(provider);
  const redirect = Linking.createURL('auth');
  const { url, secret } = await apiPublic<{ url: string; secret: string }>(
    'POST',
    `/auth/oauth/${provider}/begin`,
    { redirect },
  );
  const result = await WebBrowser.openAuthSessionAsync(url, redirect);
  if (result.type !== 'success') return 'cancelled';
  const params = new URL(result.url).searchParams;
  const error = params.get('error');
  if (error === 'cancelled') return 'cancelled';
  const ticket = params.get('ticket');
  if (!ticket) throw new ApiError(400, error ?? 'failed');
  return complete(await apiPublic('POST', '/auth/ticket', { ticket, secret }));
}
