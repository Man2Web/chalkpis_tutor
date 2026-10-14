import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json plus what must not live in this public repository: Android's Firebase file (for push), which EAS provides
 * at build time as the GOOGLE_SERVICES_JSON file variable. Locally it is simply absent (no Android push).
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
      : {}),
  },
});
