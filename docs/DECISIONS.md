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
