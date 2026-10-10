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
   | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`              | see section 4                                                                                 |

   Leave `OTP_DEV_ECHO` unset in production (it is ignored there anyway).

6. **Deploy.** The server creates and updates its database tables by itself on start. Open `https://tutor.chalkpis.com/health`: it should say `{"status":"ok","db":"up"}`.
7. **Backups.** Add the scheduled task from [BACKUPS.md](BACKUPS.md) and practise one restore.

The container build has not been tried yet (Docker is not installed on the development Mac), so expect Coolify's first build to be the first real test.

## 3. WhatsApp (login codes and parent messages)

- **Login code:** an approved _authentication_ template (id `1809804`) with one value, the code. Set `WA_API_URL` (the gateway's send address, ideally a host name), `WA_FROM` (your business number, digits only), `WA_CLIENT_ID`, `WA_CLIENT_PASSWORD` and `WA_TEMPLATE_OTP`.
- **Parent messages:** five _utility_ templates; the exact texts are in [WHATSAPP-TEMPLATES.md](WHATSAPP-TEMPLATES.md). Put the ids in `WA_TEMPLATES`. A message with no id is skipped and shown in the Message log as "No template for this message".
- To confirm with your gateway provider: that `templateinfo` is `<templateId>~<value1>~<value2>~<value3>`, and whether it expects POST or GET (`WA_API_METHOD`). Delivery reports are not tracked yet, so "Sent" means the gateway accepted the message.
- Test with a student whose parent number is **your own** number before switching messages on for everyone.

## 4. Online payments (Razorpay): switched off for now

The owner has chosen not to connect a payment gateway yet. With no `RAZORPAY_*` settings the server reports payments as unavailable, the app hides the plan buy buttons and shows a note, and nobody can renew a plan. So set `TRIAL_DAYS` to something long (for example 90 or 365) in the server settings; when a trial ends the app becomes read-only, nothing is deleted. Turn payments on later by following the steps below; nothing else changes.

1. Create a Razorpay account and finish KYC; in **Settings -> API keys** make a **Test mode** key pair first.
2. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and a `RAZORPAY_WEBHOOK_SECRET` (16+ characters of your choice).
3. In Razorpay **Settings -> Webhooks -> Add new webhook**: URL `https://tutor.chalkpis.com/billing/webhooks/razorpay`, the same secret, event **payment_link.paid**.
4. Buy a plan with Razorpay's test card or UPI. The plan switches on within seconds, and a re-delivered webhook never extends it twice.
5. When ready, swap in the Live keys.

Without keys, local runs use a mock ("Pay (test)" in the app); in production buying says "not set up yet".

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
