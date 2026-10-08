import { Linking } from 'react-native';

const digitsOnly = (e164: string) => e164.replace(/\D/g, '');

export const callUrl = (e164: string) => `tel:${e164}`;
export const whatsappUrl = (e164: string, message?: string) =>
  `https://wa.me/${digitsOnly(e164)}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
export const smsUrl = (e164: string, message?: string) =>
  `sms:${e164}${message ? `?body=${encodeURIComponent(message)}` : ''}`;

/** Opens a link; returns false if no app could handle it. */
export async function open(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
