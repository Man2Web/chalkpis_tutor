# Moving the whole backend to Hostinger

Decision (owner): host the complete database and files on Hostinger instead of Firebase.
Status: BUILT AND TESTED LOCALLY (M0 to M5). The app now talks only to the new server and Firebase has been removed. Nothing has been created on the Hostinger account yet: the next step is the deploy in [SETUP.md](SETUP.md) section 2, which needs a private GitHub repository, a domain and (for real messages and payments) the WhatsApp and Razorpay settings.

## Decisions so far

- **Target:** VPS `srv1944454` (Hostinger KVM 2: 2 CPU, 8 GB RAM, 100 GB disk, Ubuntu 24.04 with **Coolify**, IP 200.234.43.196). Chosen by the owner. The other VPS (`srv1598583`, KVM 4) and the 27 sites on the Business plan are NOT to be touched.
- **How it deploys:** Coolify (a self-hosted deploy panel) pulls the code from a Git repository and runs it in Docker, with MySQL/MariaDB as a Coolify database. Hostinger's own Docker tool does not work on Coolify servers, so deployment goes through Coolify, not through the Hostinger connection.
- **What I build in this repo:** a `server/` app (Node.js + TypeScript + MySQL) with a `Dockerfile`, migrations, tests, and a `docker-compose.yml` for local runs. Coolify then deploys it as-is.

## What "everything" means

Today the app talks directly to Firebase. Hostinger cannot run Firestore, Firebase Auth, Cloud Functions or Storage, so each part needs a replacement:

| Today (Firebase)                                               | On Hostinger                                                                                                                                                                           |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firestore database + security rules                            | **MySQL** database + a **Node.js API** that checks who may see what (the rules become server code)                                                                                     |
| Phone login (Firebase Auth)                                    | Our own **phone OTP login**: the code is sent by your WhatsApp gateway (needs an _authentication_ template), verified on the server, then a signed session token (JWT + refresh token) |
| Cloud Functions (limits, dues, billing, messages, parent view) | Routes and **cron jobs** in the same Node app                                                                                                                                          |
| Firestore triggers (message on absent, counters)               | Done inside the request that saves the data, plus a small message queue table and a worker                                                                                             |
| Storage (logos, photos)                                        | Files on the server disk, random names, served by the API                                                                                                                              |
| Hosting (parent page)                                          | Same Node app serves the parent page                                                                                                                                                   |
| Offline writes (Firestore cache)                               | Rebuilt in the app: saved-offline queue that syncs when online                                                                                                                         |

Nothing needs migrating as data: the only data so far is emulator test data.

## What stays

The mobile app screens, the design system, translations, the pure business rules (fees, attendance %, dues, plans, import, reports, message wording), and most tests. What changes is everything that reads or writes Firebase: roughly 40% of the code (the data layer, the rules, the functions) and their tests.

## Risks to decide on (please read)

1. **Shared account.** Your Business plan hosts 27 other websites (client sites). Hosting limits (CPU, memory, processes, database connections) are shared across the whole account. A busy TutorDesk (or a bug) can slow your clients' sites, and a problem on the account can take TutorDesk down. TutorDesk will hold other businesses' student records and fee data. Recommended: a **separate Hostinger VPS** (or at least a separate hosting account) for TutorDesk.
2. **Backups.** Fee records are financial data. Needs automated daily database backups kept off the server, and a tested restore.
3. **Always-on process.** Shared Node.js hosting can restart or sleep processes; scheduled jobs need Hostinger cron calling a protected endpoint. A VPS avoids this.
4. **Security work moves to us.** Firebase rules protected every read and write. On our own API, every route must check the signed-in user and their institute. This needs its own security tests (cross-tenant access, role escalation, expired plan, forged payments). I will write these before any screen is switched over.
5. **Domain and HTTPS.** An address such as `api.<domain>` with a certificate (Hostinger issues these).
6. **Offline.** Firestore's offline cache goes away; the app needs its own offline queue (Phase 2e becomes part of this).
7. **Local testing.** The API needs a MySQL to test against. Locally that means installing MariaDB/MySQL on your Mac (about 200 MB, I will ask first).

## Phases (each one finished, tested and committed before the next)

- **M0 Foundations:** server skeleton (Node + TypeScript), schema and migrations, config and secrets, health check, deploy a "hello" to Hostinger, nothing else touched.
- **M1 Login and institutes:** WhatsApp OTP login, sessions, `createInstitute`, tenant-isolation tests.
- **M2 Students and batches:** API + app data layer switched for these.
- **M3 Attendance and fees:** transactions (receipt numbers), reversals, dashboard, reports.
- **M4 Billing, messages, parent view, files:** Razorpay link + webhook, message queue, parent page, logo/photo uploads.
- **M5 Jobs, hardening, cut-over:** daily jobs via cron, rate limits, backups, load test, remove Firebase from the app, update docs.
- Then the remaining Phase 2: staff role, offline sync, Hindi audit.

## Inputs I need from you (needed at deploy time, not to start building)

- A **private GitHub repository** for TutorDesk (Coolify pulls from it). I will not push anything until you say so.
- Either your **Coolify address and an API token** (so I can create the app and database for you), or you do the clicks in Coolify and I give you the exact steps.
- The **domain** for the API, e.g. `api.chalkpis.com`, with its DNS pointing at 200.234.43.196.

## Older inputs (still needed)

- Where to host (shared plan vs VPS), and the domain/subdomain for the API.
- An approved WhatsApp **authentication** template for login codes (I will give you the exact text, same as for the other templates).
- Permission before I create any website, database or DNS record on the account.
