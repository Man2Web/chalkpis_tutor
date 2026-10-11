import { ApiError, apiPublic } from '../../api/client';
import { tokens } from '../../api/tokens';
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

/** Every sign-in answer comes through here: either signed in (the navigator switches by itself) or "add mobile". */
export async function complete(r: Verified | NeedsPhone): Promise<NeedsPhone | null> {
  if ('needsPhone' in r) return r;
  await tokens.save(r.accessToken, r.refreshToken);
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
  const r = await apiPublic<Verified>('POST', '/auth/otp/verify', {
    phone,
    code: code.trim(),
    ...(signupToken ? { signupToken } : {}),
  });
  await complete(r);
}
