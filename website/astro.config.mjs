// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static site for chalkpistutor.com. The app and sign-up stay on tutor.chalkpis.com.
export default defineConfig({
  site: 'https://chalkpistutor.com',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [sitemap()],
});
