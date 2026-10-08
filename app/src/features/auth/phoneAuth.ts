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

/** Checks the code. On success the person is signed in and the navigator switches by itself. */
export async function confirmCode(phone: string, code: string): Promise<void> {
  const r = await apiPublic<Verified>('POST', '/auth/otp/verify', { phone, code: code.trim() });
  await tokens.save(r.accessToken, r.refreshToken);
  applyMe(r);
}
