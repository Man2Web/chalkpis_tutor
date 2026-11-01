import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json plus what must not live in this public repository: Android's Firebase file (for push), which EAS provides
 * at build time as the GOOGLE_SERVICES_JSON file variable. Locally it is simply absent (no Android push).
 *
 * The browser version is exported with EXPO_WEB_BASE_URL=/app (it is served at tutor.chalkpis.com/app, see
 * `npm run web:build` at the repo root). Phone builds and updates never set it, so their runtime fingerprint is the same.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
      : {}),
  },
  ...(process.env.EXPO_WEB_BASE_URL
    ? {
        experiments: { ...config.experiments, baseUrl: process.env.EXPO_WEB_BASE_URL },
        web: {
          ...config.web,
          name: 'ChalkPis Classes',
          shortName: 'ChalkPis',
          themeColor: '#FFFFFF',
          backgroundColor: '#FFFFFF',
        },
      }
    : {}),
});
