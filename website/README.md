# ChalkPis Tutor website (chalkpistutor.com)

The marketing site for ChalkPis Tutor: a static [Astro](https://astro.build) site. The app, sign-up (`/start`) and legal pages
stay on `tutor.chalkpis.com`; this site only links to them. The design was approved on the Claude Design canvas first.

## Commands

Run from this folder (`website/`). Node 22.12 or newer.

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Dev server at http://localhost:4321 |
| `npm run build` | Build the site into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |

## Where things live

- `src/config.ts`: every outside link and contact detail (sign-up, sign-in, stores, support email, WhatsApp number).
- `src/data/plans.ts`: plans, prices, the "every plan has" list and the pricing FAQ. Mirrors `server/src/billing/plans.ts`;
  change both together.
- `src/styles/global.css`: the design system (colours, type scale, cards, buttons, spacing).
- `src/components/`: `Logo` (the C mark + "tutor", drawn as paths), `Icon`, `Nav`, `Footer`.
- `src/pages/`: `index` (home), `pricing`, `welcome` (where web sign-ups land, `?os=android|ios`; not indexed), `404`.
- `public/`: favicon, official App Store and Google Play badges, `robots.txt`.

## Before going live

- Set `SUPPORT_WHATSAPP` in `src/config.ts`. Until then, "Chat on WhatsApp" links fall back to email.
- Add more real testimonials in `src/pages/index.astro` (`QUOTES`). With three or more, the section becomes a scrolling row.
- Analytics and ad tracking are not added yet: GA4 (`G-FG0YJS71R6`) and the Meta Pixel (`1863203504670970`), plus passing
  `fbclid` and UTM values through to `/start`. `/welcome` is the page that counts a sign-up. There is no Google Ads account, so no Google Ads tag or `gclid` handling.

## Hosting

`npm run build` produces plain files in `dist/` (`index.html`, `pricing.html`, `404.html`, `sitemap-index.xml`). Any static host
works; the domain's DNS is on Cloudflare, so Cloudflare Pages is the simplest fit (build command `npm run build`, output `dist`,
root directory `website`).
