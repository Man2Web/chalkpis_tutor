import { signInWithPhoneNumber, type ConfirmationResult } from '@react-native-firebase/auth';
import { auth } from '../../lib/firebase';
import { normalizeIndianPhone } from '../../lib/phone';

let confirmation: ConfirmationResult | null = null;

export const RESEND_SECONDS = 30;
export { authErrorKey, type AuthErrorKey } from './authErrors';

/** Sends the SMS code. Throws an error whose `.code` is mapped by authErrorKey. */
export async function sendCode(rawPhone: string): Promise<string> {
  const phone = normalizeIndianPhone(rawPhone);
  if (!phone) throw { code: 'auth/invalid-phone-number' };
  confirmation = await signInWithPhoneNumber(auth, phone);
  return phone;
}

export async function confirmCode(code: string): Promise<void> {
  if (!confirmation) throw { code: 'auth/session-expired' };
  await confirmation.confirm(code.trim());
}
