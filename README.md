# TutorDesk

Tuition management for Indian private tutors and small coaching centres: students, batches, attendance, fees and parent reminders. Android-first (React Native), with English and Hindi.

## Architecture

```
app/        Expo (managed + dev client) · React Native · TypeScript strict
            src/features/*  one folder per feature: screens, pure logic (tested), Firestore writes
            src/data        React Query hooks that read Firestore; plan-limit guard
            src/components  design system (Button, Input, Card, Chip, ListItem, BottomSheet, Toast, ...)
            src/i18n        en.json / hi.json (a test keeps them identical in shape)
            src/web         browser-preview shims (Firebase web SDK); never used on Android
functions/  Cloud Functions gen2, Node 20, asia-south1
            generateFeeDues (daily 02:00 IST) · onStudentWrite / onBatchWrite (counters + plan limits)
            createInstitute · deleteAccount · seed script
firebase/   firestore.rules · storage.rules · indexes · emulator config · rules tests
docs/       PRD · DECISIONS (why) · TASKS · SETUP (Firebase + EAS) · MANUAL-TEST (phone checklist)
```

How the pieces fit:

- **Everything lives under `institutes/{id}`** so each customer is isolated. Security rules check the signed-in user's `instituteId`; roles and plan state can only be written by the server.
- **Money is integer paise.** Fee logic is pure and tested (`app/src/features/fees/logic.ts`).
- **A payment is a transaction**: receipt number + payment + due update commit together. Payments are append-only; a correction is a reversing entry.
- **Attendance is one document per batch per day**, a single write.
- **Screens stay thin**: business rules (percentages, dues, imports, reports) are plain functions with unit tests; screens call them.

## Run it on a laptop (no Android Studio)

Needs Node 20+ and Java 17+. Details and the Firebase/EAS release steps are in [docs/SETUP.md](docs/SETUP.md).

```bash
npm install && npm run install:all
npm run emulators        # terminal 1: local Firebase
npm run seed             # optional: demo institute (login with 9999900001)
npm run web              # terminal 2: app in the browser at http://localhost:8081
```

The OTP screen shows the test code in a yellow box (no SMS is sent against the emulators). The browser preview is not the real Android app: calling, WhatsApp, contacts import and native share only work on a phone. Use [docs/MANUAL-TEST.md](docs/MANUAL-TEST.md) on a real device.

## Scripts (repo root)

| Script | What it does |
|---|---|
| `npm run install:all` | install app, functions and firebase packages |
| `npm run emulators` | local Firebase emulators (builds functions first) |
| `npm run seed` | demo data: 1 institute, 3 batches, 30 students, a month of attendance, 2 months of dues, payments. Refuses to run without an emulator |
| `npm run web` | browser preview against the emulators |
| `npm run lint` / `typecheck` | across all packages |
| `npm test` | app tests + function unit tests (emulator-backed ones are skipped) |
| `npm run test:emulator` | rules tests + function/seed tests against emulators (needs Java) |

## Quality gates

`lint`, `typecheck`, `npm test` and `test:emulator` all pass; a pre-commit hook runs lint and typecheck; CI (`.github/workflows/ci.yml`) runs all of them.

## Not done yet (Phase 2)

Plans and Razorpay billing, automatic parent notifications (WhatsApp/SMS provider), parent web view, staff role, offline payments with provisional receipts, offline/sync indicator. The plan-limit prompt and read-only-after-expiry already work; there is just no way to buy a plan yet.
