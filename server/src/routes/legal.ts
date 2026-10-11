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

/**
 * How to delete a Chalkpis account, in the app or without it (Google Play asks for a web page that does not need
 * the app). Matches what deleteAccount (src/account/service.ts) actually removes and keeps.
 */
export function deleteAccountHtml(l: Legal): string {
  const mail = esc(l.email);
  const subject = encodeURIComponent('Delete my Chalkpis account');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Delete your account · Chalkpis for Tutors</title><link rel="stylesheet" href="/legal.css"></head><body><main>
<header>Chalkpis for Tutors</header>
<nav><a href="/privacy">Privacy Policy</a><a href="/terms">Terms and Conditions</a><a href="/delete-account">Delete your account</a></nav>
<h1>Delete your Chalkpis account</h1>
<p>You can delete your Chalkpis for Tutors account (made by ${esc(l.company)}) at any time, with or without the app.</p>
<h2>In the app</h2>
<p>Open Chalkpis, go to <strong>Account</strong>, tap <strong>Delete account</strong> and confirm. It happens at once.</p>
<h2>Without the app</h2>
<p>Email <a href="mailto:${mail}?subject=${subject}">${mail}</a> with the subject "Delete my Chalkpis account" and the mobile number you sign in with. We confirm it is you by a WhatsApp message to that number, then delete the account within 7 days and reply when it is done.</p>
<h2>What is deleted</h2>
<p>If you own a centre: your login and the whole centre with everything in it: students, batches, attendance, fees and payments you recorded, parent messages, parent links, helpers' access, your activity log, logo and student photos. If you are a helper: only your own login (the centre stays with its owner). Sign-in methods linked to your account (Google, Apple, email) are deleted too.</p>
<h2>What is kept, and for how long</h2>
<p>Records of plans you bought from Chalkpis (amount, date, order number) are kept, no longer linked to your centre, because accounting and tax law require them. Daily backups are deleted on a rolling basis within 14 days. A short record that an administrator acted on your account may be kept for security.</p>
<footer>© 2026 ${esc(l.company)} (${esc(l.brand)}) · <a href="mailto:${mail}">${mail}</a></footer>
</main></body></html>`;
}

/** Public Privacy Policy, Terms and account-deletion pages (needed for the app stores), plain HTML, no scripts. */
export function legalRoutes(app: FastifyInstance) {
  const legal = JSON.parse(readFileSync(path.join(PUBLIC_DIR, 'legal.json'), 'utf8')) as Legal;
  const css = readFileSync(path.join(PUBLIC_DIR, 'legal.css'), 'utf8');
  const pages = {
    privacy: legalHtml(legal, 'privacy'),
    terms: legalHtml(legal, 'terms'),
    'delete-account': deleteAccountHtml(legal),
  };
  const headers = {
    'Content-Security-Policy':
      "default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'public, max-age=3600',
  };
  for (const which of ['privacy', 'terms', 'delete-account'] as const)
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
