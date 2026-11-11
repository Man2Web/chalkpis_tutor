/**
 * /sitemap.xml, the address search engines and SEO tools try first. The real sitemap is the one @astrojs/sitemap
 * writes (sitemap-index.xml → sitemap-0.xml); this points to it, so both addresses work on any static host.
 */
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const index = new URL('/sitemap-0.xml', site).href;
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${index}</loc><lastmod>${new Date().toISOString()}</lastmod></sitemap></sitemapindex>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
