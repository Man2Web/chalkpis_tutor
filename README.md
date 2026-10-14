# Chalkpis

Class management for Indian teachers and centres: tuition and coaching centres, abacus institutes, karate, dance and yoga classes, and sports academies. Students, batches, attendance, fees and WhatsApp updates to parents. Android-first (React Native), with an iPhone build.

## What this app is about

Most small classes in India run from a notebook and WhatsApp: who came today, who has paid, whose parent needs a reminder. Chalkpis puts that on the teacher's phone, and keeps parents informed without the teacher typing a single message.

**Who it is for:** one owner (a teacher, coach or centre) and, optionally, a few helpers, at:

| Tuition centres | Coaching institutes | Abacus institutes | Karate and martial arts |
| --- | --- | --- | --- |
| **Dance classes** | **Yoga classes** | **Sports academies** | **Any other class** (music, art, chess...) |

At sign-up the owner picks what they teach, and the app speaks their language: a karate batch has a *Martial art* and a *Belt*, a sports batch a *Sport* and an *Age group*, a tuition batch a *Subject* and a *Class*. Examples, poster texts (*Toppers*, *Champions*, *Stars*) and spreadsheet columns follow the same choice, which can be changed later in Settings.

**What an owner does with it:**

- **Students and batches:** a profile per student (batch, class / level / belt, parent, monthly fee, due day), imported from contacts or a spreadsheet; one tap to call or WhatsApp the parent.
- **Attendance in seconds:** everyone starts present; tap only the absent or late ones, or mark a holiday.
- **Fees:** monthly dues are created for every student; record cash, UPI or bank payments (part payments, discounts, advances), share receipts, and see who is pending or overdue.
- **Parents stay in the loop on WhatsApp:** absent and late alerts, fee reminders carrying the owner's own UPI QR, and payment receipts, sent from the Chalkpis business number. Parents can also open a private, read-only page for their child.
- **Reports and growth:** a monthly report (billed, collected, pending, attendance) with Excel, CSV and PDF export, and a poster maker for WhatsApp status and Instagram (toppers or champions, admissions, festivals).
- **Helpers:** staff accounts that can take attendance for their assigned batches only.

**How it works:**

- **Sign up and sign in with WhatsApp:** a 6-digit code to the owner's mobile number. No passwords, no email.
- **Fees go straight to the centre:** parents pay the owner's own UPI ID or payment link; Chalkpis never touches that money.
- **Plans:** a free trial, then plans by the number of students and batches, paid on the website through Razorpay.

Built and run by M2W Technologies Private Limited (Man2Web). Contact: hello@chalkpis.com.

## Architecture

```
app/      Expo (managed + dev client) · React Native · TypeScript strict
          src/features/*  one folder per feature: screens, pure logic (tested), the calls to the server (api.ts)
          src/api         the server client: sign-in tokens, automatic refresh, uploads
          src/data        React Query hooks that read from the server
          src/components  design system (Button, Input, Card, Chip, ListItem, BottomSheet, Toast, AnimatedSplash, ...)
          src/i18n        en.json / hi.json (a test keeps them identical in shape)
server/   Node 22 · TypeScript · Fastify · MariaDB (plain SQL, no ORM)
          migrations/     numbered SQL files, applied by the server on start
          src/            routes · services · auth (WhatsApp code login, rotating sessions) · jobs · messaging queue
          public/         the read-only parent page
          scripts/        backup.sh · restore.sh · loadtest.ts
docs/     PRD · DECISIONS (why) · TASKS · SETUP (run, deploy, build) · BACKUPS · WHATSAPP-TEMPLATES · MANUAL-TEST
```

How the pieces fit:

- **Every row belongs to an institute.** The server reads the caller's institute and role from the database on every request (never from the request), and the database refuses links across institutes with composite foreign keys.
- **Money is integer paise.** A payment locks its due, takes the next receipt number and writes the payment in one transaction. Payments are append-only; a correction is a reversing entry.
- **Parent messages are queued in the same transaction as the event** (attendance saved, payment recorded) and sent by a worker with retries, so none is lost or sent twice.
- **Screens stay thin**: business rules (percentages, dues, imports, reports) are plain functions with unit tests.

## Run it on a laptop

See [docs/SETUP.md](docs/SETUP.md). In short:

```bash
npm install && npm run install:all
cp server/.env.example server/.env
npm --prefix server run db:start
npm run server     # terminal 1
npm run web        # terminal 2: http://localhost:8081
```

The browser preview is not the real Android app: calling, WhatsApp links, contacts import and native share only work on a phone. Use [docs/MANUAL-TEST.md](docs/MANUAL-TEST.md) on a real device.

## Scripts (repo root)

| Script                       | What it does                                                  |
| ---------------------------- | ------------------------------------------------------------- |
| `npm run install:all`        | install the app and server packages                           |
| `npm run server`             | the server with auto-restart (reads `server/.env`)            |
| `npm run web`                | the app in the browser                                        |
| `npm run lint` / `typecheck` | across both packages                                          |
| `npm test`                   | app tests and server tests (starts the private test database) |
| `npm run loadtest`           | 40 clients hammering a real server on a throwaway database    |

## Quality gates

`lint`, `typecheck` and `npm test` pass; a pre-commit hook runs lint and typecheck; CI (`.github/workflows/ci.yml`) runs the checks for the app and the server (with a real MariaDB).

## Not done yet

Offline use with saved-for-later changes, push notifications, delivery reports for WhatsApp messages. (The staff role is done: helpers take attendance for assigned batches only. The Hindi audit is dropped: the owner uses English only, and Hindi texts stay as they are.) The container build and the real WhatsApp and Razorpay connections are untried until the server is deployed. See [docs/TASKS.md](docs/TASKS.md).
