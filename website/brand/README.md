# Brand files used by the site

Copied unchanged from the Tutor brand kit (November 2026). Only the files the site uses are here; the full kit
(every colour version, stacked logo, PNG sizes, app icons, profile picture, brand guide) is kept outside the repo.

| File | Used by |
| --- | --- |
| `tutor-logo-color.svg` | `src/components/Logo.astro` (nav, footer, mock screens) and `scripts/og.html` (share image). The other kit versions are the same paths in other colours, so `Logo.astro` makes them with `variant`. |
| `favicon.svg` | copied to `public/favicon.svg` by `npm run images` |
| `favicon-16/32/48.png` | `public/favicon.ico` (all three) and `public/favicon-32.png` |
| `apple-touch-icon-180.png` | `public/apple-touch-icon.png` |

The kit's colours and type (Inter; ExtraBold 800 headlines, Bold 700 titles, SemiBold 600 labels) are the tokens at
the top of `src/styles/global.css`. The kit's tagline is used as "Manage • Teach • Grow", never in capitals (the user's rule). Don't redraw or retype the "tutor" letters: they are custom drawn.
