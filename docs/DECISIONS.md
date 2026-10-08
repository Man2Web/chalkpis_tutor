# Decisions log
| # | Decision | Why |
|---|---|---|
| 1 | Project lives in ~/TutorDesk, separate from VideoStudio | Isolation; chosen by owner |
| 2 | Three independent npm packages (`app`, `functions`, `firebase`) with root scripts, not workspaces | Expo Metro breaks with hoisted deps |
| 3 | Local Node is v24; functions declare `engines.node = 20` | Deploy target is Node 20; local dev works on 24 |
| 4 | Java (JDK 17+) required locally for Firebase emulators | Not installed yet; see SETUP.md |
