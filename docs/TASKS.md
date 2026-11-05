# Task list

- [x] Phase 0: monorepo, Expo app, functions, firebase config, lint/prettier/husky/CI, design system, SETUP.md, .env.example
- [x] Phase 1a: data layer, security rules + tests, functions (dues, counters, deleteAccount) + tests
- [x] Phase 1b: auth + onboarding
- [x] Phase 1c: students, batches (profile attendance summary + fee ledger and batch attendance/fee summary are added in 1d/1e)
- [x] Phase 1d: attendance (mark, holiday, past dates, reports, student + batch summaries)
- [x] Phase 1e: fees (overview, ledger, collect, receipts PDF, reversal, discounts, waive, one-off charges, fee plan, reminders)
- [x] Phase 1f: dashboard, reports (CSV + PDF), settings (profile, institute, language, delete account), seed script, README, manual test checklist
- [ ] Phase 2: staff, offline, Hindi (billing, notifications and parent view are done)

## Phase 2 progress

- [x] 2 design: premium UI applied app-wide
- [x] 2a plans and billing: catalogue, Razorpay payment links + webhook (signed, idempotent), emulator test mode, expiry job, Plans & billing screen, usage meters, expiry banner, read-only after expiry
- [x] 2b parent notifications: WhatsApp gateway provider + mock, absent/late, fee due/overdue schedule, payment thanks, per-student opt-out, message log, settings screen (SMS fallback wired in code, no SMS provider yet; delivery reports not tracked yet)
- [x] 2c parent view: private expiring/revocable link, hosted read-only page (EN/HI), owner creates/sends/revokes from the student profile
- [x] 2d staff role (invite by phone, assign batches, attendance only): server (291 tests) and app screens (Staff screen under More, attendance-only tabs for helpers; 253 app tests)
- [ ] 2e offline (offline payments with provisional receipts, sync indicator)
- [x] 2f Hindi/number-format audit: dropped (the owner uses English only; Hindi texts stay but are not audited)

## Backend move to Hostinger (replaces the Firebase backend; see docs/HOSTINGER-MIGRATION.md)

- [x] M0 foundations: `server/` (Fastify + zod + mysql2), config, migration runner, foundation schema, health, headers, rate limit, log redaction, Dockerfile, CI job, 45 tests (Docker build itself not yet tried)
- [x] M1 phone-OTP login (WhatsApp code), rotating sessions with theft detection, institute setup + 7-day trial, owner/staff guards, tenant-isolation tests (103 server tests)
- [x] M2 students and batches API: SQL tables with composite foreign keys (a cross-institute link is impossible even in raw SQL), plan limits under a per-institute lock, bulk import all-or-nothing, owner-only writes, 30 new tests (133 server tests). The app screens are switched over at M5
- [x] M3 attendance and fees API: attendance days/marks (replace-the-day, holidays, range, per-student history, report with low-attendance list), fee dues generation (idempotent, monthly/quarterly/one-time), payments with gap-free receipt numbers, one-time reversals, discount/waive/charges, overview, dashboard, fee report; 35 new tests (168 server tests). Message triggers on absent/late/payment come with M4's queue
- [x] M4 billing (Razorpay payment links + signed, idempotent webhook matched against our own orders, expiry job), parent WhatsApp messages (settings, queue written in the same transaction as the event, daily reminders, retrying worker, log with last-4 only), private parent links + hosted read-only page, logo and student-photo uploads on server disk; 58 new tests (251 server tests)
- [x] M5 scheduled jobs (nightly dues, hourly plan expiry, 9 am fee reminders, cleanup; each run is claimed in the database so servers and restarts cannot double-run), account deletion (owner: whole institute and pictures; staff: own login), CORS allow-list, no-store API responses, backup and restore scripts (restore tested with Hindi/Tamil text, checksums and refusals tested), load test (144 requests/second on a laptop with 40 clients, no errors, receipt numbers 1 to 304 without gaps), the app switched to the new server (WhatsApp-code sign-in, REST data layer, uploads), Firebase removed everywhere, clean-clone check; 270 server tests, 236 app tests
- [x] Deployed to the Hostinger VPS: https://api.chalkpis.com is live (HTTPS, database connected, parent page served). Still to do: push the newest code and redeploy, add the WhatsApp client id/password (see docs/deploy/README.md), backups run daily with an automatic restore check (off-server copy still to add)
- [x] EAS build setup prepared: eas.json (development, preview apk, production aab), Chalkpis icons, Android bundle verified. Waiting on: Expo login, `eas init`, first build (docs/SETUP.md section 5)
- [ ] then: offline use with saved-for-later changes (2e)

## Version 2 (see docs/V2-PLAN.md)

- [x] v2.0 quick wins: UPI id setting and QR on the reminder screen (share as image), "Mark as paid by UPI", Excel export with fee status per student, import from Excel/CSV (Sheets, Notion via export); 297 server tests, 266 app tests
- [ ] v2.0 still to do: the QR inside the automatic WhatsApp fee reminder needs a new template with an image header (owner to get it approved)
- [x] v2 UI: Home summary card, consistent list cards, keyboard-safe forms, responsive column (decisions 98-99)
- [x] v2 group 1 (no outside accounts): today's tasks, 7-day attendance chart with streak, first-run card, student date of birth and gender, payment link, "No UPI id" warning, advance payment for several months, attendance register Excel export (7 days to 3 months), fees history chart (6/12 months) and sorting, poster maker; 309 server tests, 275 app tests
- [ ] v2 group 2 (needs a Claude API key): AI question paper, homework, worksheet, progress note, Google profile/post/review reply, marketing kit, check a paper, register photo import
- [ ] v2.1 SMS fallback and plans/message cap; v2.2 AI Assistant and Paper Checking (v2.3's website and iPhone app are done; Google and email login were dropped, decision 133)
- [x] The app in the browser at tutor.chalkpis.com/app (decision 149): served by the server, Add to Home Screen, install hint, iPhone sign-ups sent there; 510 server tests, 366 app tests
- [x] Laptop and desktop layout for the browser version (decision 150): sidebar, top bar with search, dashboard, Students and Fees tables, Attendance cards; 371 app tests
- [x] Tests & marks (decision 151): tests per batch, marks entry with live rank and grade, WhatsApp results and toppers, report card PDF, parent page results; 9 server tests, 7 app tests
- [x] Homework (decision 152): set per batch with a due day, share to the group, tick who handed it in, note to parents, parent page; 6 server tests, 4 app tests
- [x] Enquiries & admissions (decision 153): stages, follow-ups, notes, call / WhatsApp, admit as student, Home card, desktop pipeline board; 6 server tests, 4 app tests
- [x] Timetable & calendar (decision 154): week and month views from the batches, clash check, holidays / exams / events / parent meetings, tests and homework due on the calendar, WhatsApp notice, parent page Coming up, desktop week board and month grid; 5 server tests, 10 app tests
- [x] Brothers and sisters (decision 155): confirmed family link, same-number hint, Add a brother or sister, link existing, family fees due, one parent link with a switch; 7 server tests, 3 app tests
- [x] Owner details at sign-up and the admin's payment link (decisions 156, 157)
- [x] Admin team roles (Super admin, Admin, Customer support), Team page, deleting test centres and people with a code emailed to the super admin, "Test or empty" filter, team guide docs/ADMIN-GUIDE.md (decision 158)
- [x] WhatsApp spend per day, kind and centre, wallet balance with recharge warning and daily email (decision 159)
- [x] Sign-in and sign-up redesigned as a classroom board (decision 161): welcome, mobile number, code and the four sign-up steps, on phones, tablets and laptops; no native change, so it can go out over the air; 7 new app tests (416 app tests)
- [x] One launch screen, the blue one (decision 164): the white logo animation before it is gone, on phones and in the browser
- [ ] Read the WhatsApp wallet balance automatically if wa.adsme.in offers an API for it (ask adsme)
