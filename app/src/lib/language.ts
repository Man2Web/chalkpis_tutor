import * as SecureStore from 'expo-secure-store';
import i18n from '../i18n';

export type Lang = 'en' | 'hi';
const KEY = 'tutordesk.lang';

/** Applies and remembers the language. Storage failures are ignored. */
export async function setLanguage(lang: Lang) {
  await i18n.changeLanguage(lang);
  try {
    await SecureStore.setItemAsync(KEY, lang);
  } catch {
    // not fatal
  }
}

export async function loadSavedLanguage() {
  try {
    const saved = await SecureStore.getItemAsync(KEY);
    if (saved === 'en' || saved === 'hi') await i18n.changeLanguage(saved);
  } catch {
    // keep default
  }
}
