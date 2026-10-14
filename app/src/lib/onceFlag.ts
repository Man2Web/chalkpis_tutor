import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Small on-device flags ("the welcome tour was seen", "the checklist was hidden"). SecureStore on the phone,
 * localStorage on the web; a failure reads as "not set", so at worst something is shown once more.
 */
const key = (name: string) => `cp_${name}`.replace(/[^A-Za-z0-9._-]/g, '_');

export async function readFlag(name: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key(name)) === '1';
    return (await SecureStore.getItemAsync(key(name))) === '1';
  } catch {
    return false;
  }
}

export async function setFlag(name: string): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(key(name), '1');
    else await SecureStore.setItemAsync(key(name), '1');
  } catch {
    /* not remembered: shown again next time, which is harmless */
  }
}
