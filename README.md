# Chalkpis for Tutors

Tuition management for Indian private tutors and small coaching centres: students, batches, attendance, fees and WhatsApp updates to parents. Android-first (React Native), English and Hindi.

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
