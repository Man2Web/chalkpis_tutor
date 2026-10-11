import { ApiError, apiPublic } from '../../api/client';
import { prefs, tokens } from '../../api/tokens';
import { normalizeIndianPhone } from '../../lib/phone';
import { applyMe, type MeResponse } from './session';

export const RESEND_SECONDS = 60; // the server allows one code a minute per number
export { authErrorKey, type AuthErrorKey } from './authErrors';

let devCode: { phone: string; code: string } | null = null;
/** Test mode only: the server returns the code when it runs with OTP_DEV_ECHO (never in production). */
export const devCodeFor = (phone: string) => (devCode?.phone === phone ? devCode.code : null);

/** Sends the login code by WhatsApp. Throws an ApiError whose code is mapped by authErrorKey. */
export async function sendCode(rawPhone: string): Promise<string> {
  const phone = normalizeIndianPhone(rawPhone);
  if (!phone) throw new ApiError(400, 'invalid_phone');
  const r = await apiPublic<{ devCode?: string }>('POST', '/auth/otp/request', { phone });
  devCode = r.devCode ? { phone, code: r.devCode } : null;
  return phone;
}

interface Verified extends MeResponse {
  accessToken: string;
  refreshToken: string;
}

/** A new Google / Apple / email person who still has to verify a mobile number once. */
export interface NeedsPhone {
  needsPhone: true;
  signupToken: string;
  email: string | null;
  name: string | null;
}

export type SignInMethod = 'whatsapp' | 'google' | 'apple' | 'email';
const METHODS: SignInMethod[] = ['whatsapp', 'google', 'apple', 'email'];
let starting: SignInMethod = 'whatsapp';
/** The button the person started with; remembered once they are in, to mark it "Last used" next time. */
export const startingWith = (m: SignInMethod) => {
  starting = m;
};
export async function lastSignInMethod(): Promise<SignInMethod | null> {
  const v = await prefs.get('lastSignIn');
  return METHODS.includes(v as SignInMethod) ? (v as SignInMethod) : null;
}

/** Every sign-in answer comes through here: either signed in (the navigator switches by itself) or "add mobile". */
export async function complete(r: Verified | NeedsPhone): Promise<NeedsPhone | null> {
  if ('needsPhone' in r) return r;
  await tokens.save(r.accessToken, r.refreshToken);
  await prefs.set('lastSignIn', starting);
  applyMe(r);
  return null;
}

/**
 * Checks the WhatsApp code. With a signupToken it also connects the pending Google / Apple / email sign-in to this
 * number (a new account, or the one the number already has).
 */
export async function confirmCode(
  phone: string,
  code: string,
  signupToken?: string,
): Promise<void> {
  // finishing a Google / Apple / email sign-up keeps that method; a plain WhatsApp sign-in is WhatsApp
  if (!signupToken) startingWith('whatsapp');
  const r = await apiPublic<Verified>('POST', '/auth/otp/verify', {
    phone,
    code: code.trim(),
    ...(signupToken ? { signupToken } : {}),
  });
  await complete(r);
}
