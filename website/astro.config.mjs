// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static site for chalkpistutor.com. The app and sign-up stay on tutor.chalkpis.com.
export default defineConfig({
  site: 'https://chalkpistutor.com',
  trailingSlash: 'never',
  build: { format: 'file' },
  // /welcome (where sign-ups land) and /get-app (where QR codes lead) are not for search engines
  // lastmod is the build date: the site is rebuilt only when its pages change.
  integrations: [
    sitemap({
      filter: (page) => !/\/(welcome|get-app)$/.test(page),
      lastmod: new Date(),
    }),
  ],
});
