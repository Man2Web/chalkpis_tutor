import i18n from '../i18n';

/** The app is English only; kept so older call sites keep working. */
export type Lang = 'en';

export async function loadSavedLanguage() {
  if (i18n.language !== 'en') await i18n.changeLanguage('en');
}
