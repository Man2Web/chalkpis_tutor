# TutorDesk — Product Requirements (condensed)

Android-first app for private tutors and small coaching centres in India: students, batches, attendance, fees, parent updates.
Stack: Expo (managed + dev client, EAS), TypeScript strict, React Navigation, React Native Firebase (Auth, Firestore offline, Storage, FCM, App Check, Crashlytics, Analytics), Cloud Functions gen2 (Node 20, asia-south1), React Query + Zustand, react-hook-form + zod, i18next (en, hi).

## Roles
- Owner (MVP): full access. Staff (Phase 2): assigned batches, attendance only. Parent (Phase 2): read-only via token link.
- One institute per owner. All data under `institutes/{instituteId}`.

## Phase 1 (MVP)
- Auth: phone OTP, resend timer. Onboarding wizard (profile -> first batch -> students) creating users, institute, subscription/current (7-day trial), counters/stats in one batch.
- Students: full field set, search/filter, soft delete, profile, CSV + contacts import with preview.
- Batches: CRUD, multi-batch students, roster, archive keeps history.
- Attendance: one doc per batch per day, default Present, P/A/L toggle, mark-all, holiday, past edits, reports with <75% list.
- Fees: plans, discounts/waivers/one-off charges, daily idempotent due generation (`studentId_yyyy-mm`), append-only payments (partial ok, reversing entries), PDF receipt with transactional receipt number, overdue list, WhatsApp/SMS reminder.
- Dashboard, Reports (collection, attendance trend, low attendance; PDF/CSV), Settings (profile, institute, language, logout, delete account).
- Money = integer paise. Every doc has createdAt/updatedAt.

## Phase 2
Razorpay plans/billing + read-only after expiry; parent notifications (provider interface, mock provider, SMS fallback); parent web view; staff role; offline verification + sync indicator; full Hindi + Indian number format.

## Non-functional
Android 8+, cold start <3s on 2 GB, attendance screen <1s for 100 students, APK <50 MB, paginate, low reads, no PII in logs, 48dp targets, Crashlytics/Analytics events.

## Acceptance
- 30-student batch opens all Present; one tap marks Absent.
- Fee 1,500 with 1,000 paid -> 500 pending, receipt for 1,000.
- New month creates exactly one due per active student; re-run creates none.
- `npm run typecheck|lint|test` + rules/functions tests pass; `npm run seed` works; SETUP.md yields a signed release build.
