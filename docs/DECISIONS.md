# Decisions log
| # | Decision | Why |
|---|---|---|
| 1 | Project lives in ~/TutorDesk, separate from VideoStudio | Isolation; chosen by owner |
| 2 | Three independent npm packages (`app`, `functions`, `firebase`) with root scripts, not workspaces | Expo Metro breaks with hoisted deps |
| 3 | Local Node is v24; functions declare `engines.node = 20` | Deploy target is Node 20; local dev works on 24 |
| 4 | Java (JDK 17+) required locally for Firebase emulators | Not installed yet; see SETUP.md |
| 5 | Onboarding calls a `createInstitute` callable (Admin SDK, one transaction) instead of a client batch | Rules make `subscription`, `counters` and `institutes` create server-only; clients can never grant themselves an institute or plan |
| 6 | Fee `monthlyFee` is per month; a quarterly due = 3 x monthlyFee; one-time = monthlyFee once in the joining month | Single fee field, simple maths |
| 7 | Dues are generated only for the current IST month, skipped when the plan is expired | Matches read-only-after-expiry; re-runs are no-ops because doc ids are `studentId_yyyy-mm` |
| 8 | Firebase emulators currently run on Java 17; firebase-tools 15 will need Java 21 | Upgrade JDK when we move to firebase-tools 15 |
| 9 | Onboarding ends only when `users/{uid}.onboardingDone` is set; app resumes at the batch step if closed mid-wizard | The institute exists after step 1, so "has institute" alone cannot mean "finished" |
| 10 | Tab screens other than More are temporary stubs until their features land (1c–1f) | Built feature by feature, each with tests |
| 11 | Android bundle ships all Expo vector-icon fonts for now (4 MB JS+assets) | Revisit icon fonts when checking the 50 MB APK limit in 1f |
| 12 | Student and batch lists load once (React Query + Firestore offline cache) and search/filter on the phone; the list itself is windowed (FlatList) | A tutor has tens to a few hundred students; server-side prefix search would be case-sensitive and cost more reads. Revisit if a centre exceeds ~1,000 students |
| 13 | `batch.studentCount` counts ACTIVE students and is updated in the same write as the student change (increment) | Keeps batch lists cheap (no per-batch student queries) |
| 14 | Contact import saves the contact's number as the PARENT phone | Tutors usually save parents' numbers; students can be edited afterwards |
| 15 | CSV import skips problem rows (never partially imports a row), flags duplicates (same name + parent phone), and offers a shareable error report | Predictable, re-runnable imports |
| 16 | Local dev uses a fake `app/google-services.json` for project `demo-tutordesk` and emulators started with `--project demo-tutordesk` | Lets the app run against emulators with no Firebase account; the file is git-ignored and replaced by the real one for production (SETUP.md) |
| 17 | Browser preview: Metro swaps `@react-native-firebase/*` for the Firebase web SDK only when platform is web (`app/metro.config.js`, `app/src/web/*`); analytics/crashlytics are no-ops there | Lets the owner test on a laptop without Android Studio; the native Android build is untouched. Not a shipping target |
| 18 | Plural strings use i18next `_one`/`_other` keys | Avoids "1 students" |
| 19 | Attendance % = (Present + Late) / (Present + Late + Absent); holiday/cancelled days are excluded; a student only counts on days they were marked | Late students attended; joiners and leavers are not penalised for days outside their time in the batch |
| 20 | Attendance doc stores `date` as yyyy-mm-dd (Indian time) plus `holiday`/`reason`; saving replaces the whole day | Sorts as text; removed marks cannot linger |
| 21 | Roster for a date = saved marks + active batch members who had joined by then; future dates cannot be marked | Past days stay editable even after a student leaves; backfilling earlier than a joining date needs the joining date changed |
