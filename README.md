# TutorDesk

Tuition management for Indian private tutors: students, batches, attendance, fees, parent updates. Android-first.

- `app/` Expo + React Native + TypeScript (React Native Firebase)
- `functions/` Cloud Functions gen2, Node 20, `asia-south1`
- `firebase/` Firestore/Storage rules, indexes, `firebase.json`, rules tests
- `docs/` PRD, DECISIONS, TASKS, SETUP

Start with [docs/SETUP.md](docs/SETUP.md). To just try it on a laptop: `npm run install:all`, then `npm run emulators` and `npm run web` (see SETUP.md section 1b).

| Script | What it does |
|---|---|
| `npm run install:all` | install app, functions, firebase packages |
| `npm run emulators` | local Firebase emulators (builds functions first) |
| `npm run web` | browser preview of the app against the emulators |
| `npm run typecheck` / `lint` / `test` | checks across all packages |
| `npm run test:emulator` | rules + functions tests against emulators (needs Java 17+) |
| `npm run seed` | demo data (added in Phase 1f) |
