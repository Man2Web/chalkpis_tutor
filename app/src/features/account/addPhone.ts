import { api, ApiError } from '../../api/client';
import { normalizeIndianPhone } from '../../lib/phone';
import { RESEND_SECONDS } from '../auth/phoneAuth';
import { applyMe, type MeResponse } from '../auth/session';

let devCode: { phone: string; code: string } | null = null;
/** Test mode only: the server returns the code when it runs with OTP_DEV_ECHO (never in production). */
export const devPhoneCodeFor = (phone: string) => (devCode?.phone === phone ? devCode.code : null);

/**
 * Sends a WhatsApp code to the number a signed-in person (an older account without one) wants to add.
 * Answers the number as sent and the seconds before another code may be asked for.
 */
export async function requestPhoneCode(
  rawPhone: string,
): Promise<{ phone: string; resendIn: number }> {
  const phone = normalizeIndianPhone(rawPhone);
  if (!phone) throw new ApiError(400, 'invalid_phone');
  const r = await api<{ resendInSeconds?: number; devCode?: string }>('POST', '/me/phone/request', {
    phone,
  });
  devCode = r.devCode ? { phone, code: r.devCode } : null;
  return { phone, resendIn: r.resendInSeconds ?? RESEND_SECONDS };
}

/** Checks the code; the number is then on the account and the session shows it straight away. */
export async function verifyPhoneCode(phone: string, code: string): Promise<void> {
  applyMe(await api<MeResponse>('POST', '/me/phone/verify', { phone, code: code.trim() }));
}
