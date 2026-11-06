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
- `src/pages/`: `index` (home), `pricing`, `for/[slug]` (the 7 class pages, content in `src/data/classes.ts`), `cookies`,
  `welcome` (where web sign-ups land, `?os=android|ios`; not indexed), `404`.
- `scripts/`: `npm run images` remakes `public/og.png` (the link preview, from `scripts/og.html`) and the icons.

## Class pages and their Meta ads

Each Meta ad points at the page for its kind of class. Website URL, then in the ad's **URL parameters** box
`utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`:

| Class | Website URL |
| --- | --- |
| Tuition | https://chalkpistutor.com/for/tuition-classes |
| Coaching | https://chalkpistutor.com/for/coaching-institutes |
| Abacus | https://chalkpistutor.com/for/abacus-classes |
| Karate and martial arts | https://chalkpistutor.com/for/karate-classes |
| Dance and music | https://chalkpistutor.com/for/dance-classes |
| Yoga and fitness | https://chalkpistutor.com/for/yoga-classes |
| Sports | https://chalkpistutor.com/for/sports-academies |

The site carries those `utm_*` values on to sign-up (`/start`), so each new centre records which ad brought it.
- `public/`: favicon, official App Store and Google Play badges, `robots.txt`.

## Before going live

- Set `SUPPORT_WHATSAPP` in `src/config.ts`. Until then, "Chat on WhatsApp" links fall back to email.
- Add more real testimonials in `src/pages/index.astro` (`QUOTES`). With three or more, the section becomes a scrolling row.

## Tracking

`src/components/Analytics.astro` (IDs in `src/config.ts`), with the cookie banner in `CookieBanner.astro` and the policy at
`/cookies`. The full spec is TRACKING-GUIDE.md. There is no Google Ads account, so no Google Ads tag or `gclid` handling.

- **GA4** `G-FG0YJS71R6`: runs with cookies from the first visit (the cookie banner is a notice with "Got it", the user's choice on 6 Nov 2026). Cookieless only for a visitor who turns tracking off on /cookies. Ad storage stays denied.
- **Meta Pixel** `1863203504670970`: loads on the first visit, unless the visitor turned tracking off on /cookies.
- Events: `start_signup_click` / `StartSignUp`, `play_store_click` / `PlayStoreClick` (with `placement`), `app_store_click`
  (GA only), and on `/welcome?os=…` once per visit `sign_up` / `CompleteRegistration`.
- The visit's `utm_*` are added to every `/start` link (the server saves them with the new centre) and to Google Play
  links as the install `referrer`. `fbclid` and the GA client ID are not passed on: the server keeps `utm_*` only.

## Hosting

`npm run build` produces plain files in `dist/` (`index.html`, `pricing.html`, `404.html`, `sitemap-index.xml`). Any static host
works; the domain's DNS is on Cloudflare, so Cloudflare Pages is the simplest fit (build command `npm run build`, output `dist`,
root directory `website`).
