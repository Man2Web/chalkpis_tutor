import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

interface Doc {
  title: string;
  updated: string;
  intro: string;
  sections: { h: string; p: string[] }[];
}
interface Legal {
  company: string;
  brand: string;
  email: string;
  privacy: Doc;
  terms: Doc;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The same text the app shows (public/legal.json is a copy of app/src/features/legal/legal.json). */
export function legalHtml(l: Legal, which: 'privacy' | 'terms'): string {
  const d = l[which];
  const body = d.sections
    .map((s) => `<h2>${esc(s.h)}</h2>${s.p.map((p) => `<p>${esc(p)}</p>`).join('')}`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.title)} · Chalkpis for Tutors</title><link rel="stylesheet" href="/legal.css"></head><body><main>
<header>Chalkpis for Tutors</header>
<nav><a href="/privacy">Privacy Policy</a><a href="/terms">Terms and Conditions</a></nav>
<h1>${esc(d.title)}</h1><p class="updated">Last updated ${esc(d.updated)}</p><p>${esc(d.intro)}</p>${body}
<footer>© 2026 ${esc(l.company)} (${esc(l.brand)}) · <a href="mailto:${esc(l.email)}">${esc(l.email)}</a></footer>
</main></body></html>`;
}

/** Public Privacy Policy and Terms pages (needed for the app stores), plain HTML, no scripts. */
export function legalRoutes(app: FastifyInstance) {
  const legal = JSON.parse(readFileSync(path.join(PUBLIC_DIR, 'legal.json'), 'utf8')) as Legal;
  const css = readFileSync(path.join(PUBLIC_DIR, 'legal.css'), 'utf8');
  const pages = { privacy: legalHtml(legal, 'privacy'), terms: legalHtml(legal, 'terms') };
  const headers = {
    'Content-Security-Policy':
      "default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'public, max-age=3600',
  };
  for (const which of ['privacy', 'terms'] as const)
    app.get(`/${which}`, async (_req, reply) =>
      reply.headers(headers).type('text/html; charset=utf-8').send(pages[which]),
    );
  app.get('/legal.css', async (_req, reply) =>
    reply
      .headers({ 'Cache-Control': 'public, max-age=3600' })
      .type('text/css; charset=utf-8')
      .send(css),
  );
}
