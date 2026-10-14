# Setup guide

Chalkpis for Tutors has two parts: the **app** (`app/`, React Native) and the **server** (`server/`, Node.js + MariaDB). The server holds all the data, sends the WhatsApp messages and serves the parent page.

## 1. Try everything on your Mac (no Android phone needed)

You need Node 22+ and MariaDB (`brew install mariadb`; it is only used by the project's own private copy, nothing is installed as a service).

```
npm install && npm run install:all
cp server/.env.example server/.env      # local settings; edit if you like
npm --prefix server run db:start        # a private MariaDB on port 3307 (stop with db:stop)
npm run server                          # terminal 1: the server at http://127.0.0.1:8787
npm run web                             # terminal 2: the app in the browser at http://localhost:8081
```

In the browser the app asks for a mobile number; with `OTP_DEV_ECHO=true` (the example setting) no WhatsApp message is sent and the code is shown on the screen in a yellow box. In `server/.env` also set `CORS_ORIGINS=http://localhost:8081` so the browser is allowed to talk to the server.

Tests: `npm test` (app and server). `npm run loadtest` runs the load test.

## 2. Put the server on your Hostinger VPS (Coolify)

The server is a Docker app (`server/Dockerfile`); Coolify builds and runs it. Do these once.

1. **Git repository.** `https://github.com/Man2Web/chalkpis_tutor.git`. Push this project to it from a terminal that is signed in to GitHub with write access: `git push -u origin main`. For a private repository, Coolify pulls with a **deploy key**: in Coolify choose **Private Repository (with Deploy Key)**, copy the public key it shows, and add it in GitHub under the repository's **Settings -> Deploy keys** (read-only is enough).
2. **Database.** In Coolify: **New resource -> Database -> MariaDB 11**. Note its internal host name, user, password and database name. Turn on its **Backups** (see [BACKUPS.md](BACKUPS.md)).
3. **Application.** **New resource -> Application -> your repository**, build pack **Dockerfile**, base directory `server`, port `8080`. Add a **persistent storage** volume mounted at `/data/uploads` (logos and student photos live there) and another at `/data/backups`.
4. **Domain.** Done: `tutor.chalkpis.com` points to the VPS (200.234.43.196). In Coolify set the application's domain to `https://tutor.chalkpis.com`; Coolify issues the HTTPS certificate by itself.
5. **Settings (Environment variables).** Set these in Coolify, never in the code. Generate each secret with `openssl rand -base64 48`.

   | Setting                                                                          | Value                                                                                         |
   | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
   | `NODE_ENV`                                                                       | `production`                                                                                  |
   | `TRUST_PROXY`                                                                    | `true`                                                                                        |
   | `PUBLIC_BASE_URL`                                                                | `https://tutor.chalkpis.com`                                                                    |
   | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`                        | from the Coolify database                                                                     |
   | `JWT_SECRET`, `OTP_PEPPER`                                                       | two different long random values                                                              |
   | `WA_API_URL`, `WA_FROM`, `WA_CLIENT_ID`, `WA_CLIENT_PASSWORD`, `WA_TEMPLATE_OTP` | your WhatsApp gateway (see section 3)                                                         |
   | `WA_TEMPLATES`                                                                   | the approved parent-message template ids (see [WHATSAPP-TEMPLATES.md](WHATSAPP-TEMPLATES.md)) |
   | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | see section 4 (plan payments) |

   Leave `OTP_DEV_ECHO` unset in production (it is ignored there anyway).

6. **Deploy.** The server creates and updates its database tables by itself on start. Open `https://tutor.chalkpis.com/health`: it should say `{"status":"ok","db":"up"}`.
7. **Backups.** Add the scheduled task from [BACKUPS.md](BACKUPS.md) and practise one restore.

The container build has not been tried yet (Docker is not installed on the development Mac), so expect Coolify's first build to be the first real test.

## 3. WhatsApp (login codes and parent messages)

- **Login code:** an approved _authentication_ template (id `1809804`) with one value, the code. Set `WA_API_URL` (the gateway's send address, ideally a host name), `WA_FROM` (your business number, digits only), `WA_CLIENT_ID`, `WA_CLIENT_PASSWORD` and `WA_TEMPLATE_OTP`.
- **Parent messages:** eight _utility_ templates (`cp_*`, made in wa.adsme.in); the exact texts are in [WHATSAPP-TEMPLATES.md](WHATSAPP-TEMPLATES.md). Put their template ids in `WA_TEMPLATES`. A message with no id is skipped and shown in the Message log as "No template for this message".
- To confirm with your gateway provider: that `templateinfo` is `<templateId>~<value1>~<value2>~<value3>`, and whether it expects POST or GET (`WA_API_METHOD`). Delivery reports are not tracked yet, so "Sent" means the gateway accepted the message.
- Test with a student whose parent number is **your own** number before switching messages on for everyone.

## 4. Online payments: Razorpay (plan purchases on the website)

Owners can pay for Starter / Standard / Pro, monthly or yearly, on the website (`tutor.chalkpis.com/plan`, or their
centre's `/pay/` link); inside the iPhone and Android apps they subscribe through the store (section 4c). The server creates a Razorpay payment link for the order, the owner pays on Razorpay's
own page (UPI, card, net banking, wallets) and is sent back to `/billing/return`; the plan switches on within seconds.

1. In the Razorpay dashboard (live mode), **Account & Settings > API Keys > Generate Key**: note the **Key ID** and the
   **Key Secret** (shown once).
2. In Coolify (server environment variables), set (type the values yourself; never paste them in chat):
   | Variable | Value |
   | --- | --- |
   | `RAZORPAY_KEY_ID` | Key ID |
   | `RAZORPAY_KEY_SECRET` | Key Secret |
   | `RAZORPAY_WEBHOOK_SECRET` | a long secret you make up (16+ characters, used in step 3) |
   | `PUBLIC_BASE_URL` | `https://tutor.chalkpis.com` (where Razorpay sends the payer back) |
3. In Razorpay, **Account & Settings > Webhooks > Add New Webhook**: URL
   `https://tutor.chalkpis.com/billing/webhooks/razorpay`, the same secret, active event **payment_link.paid**.
4. Restart, then buy the cheapest plan once from `/plan` to check the whole path (refund it from the Razorpay dashboard
   afterwards if you like).

Without Razorpay keys, production says online payment is not set up (set `TRIAL_DAYS` long meanwhile), and local
development uses a built-in stand-in.

## 4c. In-app subscriptions: App Store and Google Play (through RevenueCat)

Inside the apps, plans are auto-renewing store subscriptions (Apple and Google allow no other way to sell them there).
RevenueCat checks the purchases with Apple and Google and tells the server; the buyer is the centre (RevenueCat's app
user id is the institute id). Prices: Starter ₹199 / ₹1,999, Standard ₹299 / ₹2,999, Pro ₹499 / ₹4,999 (month / year),
and ₹49 for the first month of a monthly plan for someone who never subscribed.

1. **Apple (App Store Connect, account holder):** Business > accept the **Paid Applications Agreement**, add bank and
   tax details. Apply for the **App Store Small Business Program** (15% commission instead of 30%).
2. **Google (Play Console):** Settings > Payments profile: set up the merchant account.
3. **Products.** Apple: app > Subscriptions > one group "Chalkpis plans" with six auto-renewable subscriptions, levels
   Pro (1) > Standard (2) > Starter (3): `chalkpis.starter.monthly`, `chalkpis.starter.yearly`,
   `chalkpis.standard.monthly`, `chalkpis.standard.yearly`, `chalkpis.pro.monthly`, `chalkpis.pro.yearly`, each with
   its price, a display name, a description and a review screenshot of the Plans screen; on the three monthly ones an
   introductory offer "Pay as you go, 1 month, ₹49" for new subscribers. Google: Monetize > Subscriptions (only after a
   build with billing is on a testing track): `chalkpis.starter`, `chalkpis.standard`, `chalkpis.pro`, each with base
   plans `monthly` and `yearly` (auto-renewing, the same prices) and on `monthly` an offer for new customers: one
   month at ₹49. Product ids cannot be reused once made, so type them exactly.
4. **RevenueCat** (free account): a project with the App Store app (bundle `in.chalkpis.tutors`, an In-App Purchase
   key from App Store Connect > Users and Access > Integrations, uploaded by you) and the Play Store app (package
   `in.chalkpis.tutors`, a Google Cloud service account with Play Console financial access, its JSON uploaded by you;
   also turn on Google's real-time notifications as RevenueCat describes). Import the products, make one entitlement
   per plan (`starter`, `standard`, `pro`) and the **current offering** with all six products. Integrations >
   Webhooks: see docs/deploy/README.md.
5. In Coolify set `REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_IOS_KEY`, `REVENUECAT_ANDROID_KEY`
   (type them yourself) and restart. The apps show the store plans from then on.
6. **Test:** App Store Connect > Users and Access > Sandbox testers (a fresh email), and Play Console > License
   testing (your Gmail). Buy, upgrade, cancel and restore in the TestFlight / internal-testing build; admin > Payments
   shows these as "Store tests", not revenue.

How it behaves: a store subscription decides the plan until its expiry date; when it takes over, what was left of the
trial or a website plan is kept and resumes after it ends (nobody loses paid days). While it renews by itself the
website and pay links sell nothing, and plan-ending reminders are skipped. A refund, an expiry or a move to another
centre (Restore on another account) hands back to the kept days. The webhook only says "look again": the server always
reads the subscription from RevenueCat with the secret key, and an hourly job does the same for subscriptions about to
end, in case a webhook was missed.

## 4b. Email for the admin dashboard

Tutors sign up and sign in only with WhatsApp (a 6-digit code to their mobile). Email is used only by the admin dashboard: its sign-in codes, password resets and lockout alerts. It goes through the hello@chalkpis.com mailbox at Zoho Mail (India data centre). The compose file already carries the non-secret values; in Coolify you only type the password:
| Variable | Value |
| --- | --- |
| `SMTP_HOST` | `smtp.zoho.in` (preset) |
| `SMTP_PORT` | `465` (preset) |
| `SMTP_USER` | `hello@chalkpis.com` (preset) |
| `SMTP_PASS` | a Zoho **app-specific password** (Zoho Accounts > Security > App passwords; type it yourself in Coolify) |
| `MAIL_FROM` | `Chalkpis <hello@chalkpis.com>` (preset) |

Restart the service after adding settings. The Google and Apple settings (`GOOGLE_*`, `APPLE_*`) are no longer read and can be deleted from Coolify.

## 4c. Store review login and account deletion page

Apple and Google reviewers cannot receive a WhatsApp code. While a review runs, set in Coolify:
| Variable | Value |
| --- | --- |
| `REVIEW_PHONE` | a number you own that is not used by anyone else, e.g. `9xxxxxxxxx` |
| `REVIEW_CODE` | any 6 digits |

Restart, sign in once on your phone with that number (it creates the account) and add a few demo students. Give the number and code to the reviewers: App Store Connect > App Review Information, and Play Console > App content > App access. Remove both settings after approval.

For Play Console > Data safety > account deletion, use `https://tutor.chalkpis.com/delete-account`. Privacy policy: `https://tutor.chalkpis.com/privacy`.

## 5. Build the Android app (EAS)

Already prepared in the repository: `app/eas.json` (three build profiles, each pointing the app at `https://tutor.chalkpis.com`), the app name and package id (`in.chalkpis.tutors`), and the Chalkpis icons (made from the animation's mark: launcher icon, Android adaptive and themed icons). The app was checked to bundle for Android.

Steps that need your Expo account (free, https://expo.dev):

1. In a terminal: `cd app && npx eas-cli@latest login` (type your Expo email and password there; nobody else sees them).
2. `npx eas-cli@latest init` creates the project on your account and writes its id into `app.json` (replacing `REPLACE_WITH_EAS_PROJECT_ID`). Commit that change.
3. **A test build you can install on any Android phone:** `npx eas-cli@latest build --platform android --profile preview` (about 15 to 25 minutes; you get a download link to an `.apk`).
4. **The Play Store build:** `npx eas-cli@latest build --platform android --profile production` makes an `.aab`. EAS creates and stores the signing key for you; back it up with `npx eas-cli@latest credentials`.
5. Play Console (https://play.google.com/console, one-time US$25 fee): create the app, fill in the store listing, add a **privacy policy address** (set `EXPO_PUBLIC_PRIVACY_POLICY_URL` in the profile's `env` in `eas.json` once you have one) and the data-safety form, then upload the `.aab` to an **internal testing** track first. The in-app delete-account flow (Settings) that Google requires is built.

Changing the server address later: edit `EXPO_PUBLIC_API_URL` in `app/eas.json` and build again.

## 6. Parent page

Parents open `https://tutor.chalkpis.com/p/<token>`. The tutor makes the link on the student's profile. The page is served by the same server (`server/public/`), is read-only, and shows one student's attendance, fees and receipts only.

## 6. Updating the app without a new build (EAS Update)

Small changes to screens, texts, colours and app logic (anything in JavaScript) reach phones over the air: no new
build, no Play Store review. The app checks for an update each time it opens and uses it on the **next** start.

**One time:** the app must contain `expo-updates`, so make **one** new build after this change
(`npx eas-cli@latest build --profile preview --platform android`, or `production` for the Play Store) and install it.

**Each update** (from the `app` folder, after `npx eas-cli@latest login`):

```bash
npm run update:preview -- "Fix fee reminder text"
npm run update:production -- "Fix fee reminder text"
```

`preview` reaches phones with the preview (APK) build, `production` the Play Store build. The scripts always build
against `https://tutor.chalkpis.com`, never the laptop address in `app/.env`.

**What still needs a new build:** anything native: adding or upgrading a library with native code (camera, keyboard,
haptics...), changing `app.json` (name, icon, permissions, splash) or upgrading Expo. The app uses the
`fingerprint` runtime version, so an update made after such a change is simply not offered to older builds; make a
new build instead. To undo a bad update: `npx eas-cli@latest update:republish` the previous one, or publish a fix.

## 7. Store listing links

- Privacy Policy: https://tutor.chalkpis.com/privacy
- Terms and Conditions: https://tutor.chalkpis.com/terms
- Support email: hello@chalkpis.com

To change the wording, edit `app/src/features/legal/legal.json`, copy it to `server/public/legal.json`, redeploy the
server and publish an app update.
