# Task list

- [x] Phase 0: monorepo, Expo app, functions, firebase config, lint/prettier/husky/CI, design system, SETUP.md, .env.example
- [x] Phase 1a: data layer, security rules + tests, functions (dues, counters, deleteAccount) + tests
- [x] Phase 1b: auth + onboarding
- [x] Phase 1c: students, batches (profile attendance summary + fee ledger and batch attendance/fee summary are added in 1d/1e)
- [x] Phase 1d: attendance (mark, holiday, past dates, reports, student + batch summaries)
- [x] Phase 1e: fees (overview, ledger, collect, receipts PDF, reversal, discounts, waive, one-off charges, fee plan, reminders)
- [x] Phase 1f: dashboard, reports (CSV + PDF), settings (profile, institute, language, delete account), seed script, README, manual test checklist
- [ ] Phase 2: billing, notifications, parent view, staff, offline, Hindi

## Phase 2 progress

- [x] 2 design: premium UI applied app-wide
- [x] 2a plans and billing: catalogue, Razorpay payment links + webhook (signed, idempotent), emulator test mode, expiry job, Plans & billing screen, usage meters, expiry banner, read-only after expiry
- [x] 2b parent notifications: WhatsApp gateway provider + mock, absent/late, fee due/overdue schedule, payment thanks, per-student opt-out, message log, settings screen (SMS fallback wired in code, no SMS provider yet; delivery reports not tracked yet)
- [x] 2c parent view: private expiring/revocable link, hosted read-only page (EN/HI), owner creates/sends/revokes from the student profile
- [ ] 2d staff role (invite by phone, assign batches, attendance only)
- [ ] 2e offline (offline payments with provisional receipts, sync indicator)
- [ ] 2f Hindi/number-format audit

## Backend move to Hostinger (replaces the Firebase backend; see docs/HOSTINGER-MIGRATION.md)

- [x] M0 foundations: `server/` (Fastify + zod + mysql2), config, migration runner, foundation schema, health, headers, rate limit, log redaction, Dockerfile, CI job, 45 tests (Docker build itself not yet tried)
- [x] M1 phone-OTP login (WhatsApp code), rotating sessions with theft detection, institute setup + 7-day trial, owner/staff guards, tenant-isolation tests (103 server tests)
- [x] M2 students and batches API: SQL tables with composite foreign keys (a cross-institute link is impossible even in raw SQL), plan limits under a per-institute lock, bulk import all-or-nothing, owner-only writes, 30 new tests (133 server tests). The app screens are switched over at M5
- [ ] M3 attendance and fees
- [ ] M4 billing, messages, parent view, files
- [ ] M5 jobs, hardening, backups, cut-over, remove Firebase
- [ ] then: staff role, offline sync, Hindi audit
