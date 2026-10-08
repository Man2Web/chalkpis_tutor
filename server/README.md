# TutorDesk server (Hostinger backend)

Node.js + TypeScript + MySQL/MariaDB. Replaces the Firebase backend (plan: `docs/HOSTINGER-MIGRATION.md`).
Status: **M0 foundations**. Config, database access, migrations, schema (users, institutes, memberships, subscriptions), health checks, security headers, rate limiting, log redaction. No business routes yet (M1 adds login).

## Run it here

```bash
npm --prefix server install
npm --prefix server run db:start      # private test database on port 3307 (its own folder, no system service)
cp server/.env.example server/.env    # then: npm --prefix server run dev   (http://127.0.0.1:8787/health)
npm --prefix server test              # needs db:start first
npm --prefix server run db:stop       # when done
```

Port 8787 locally because the Firebase emulator uses 8080.

## Rules the code follows

- **Migrations** (`migrations/NNN_name.sql`) are applied once, in order, under a database lock. An applied file is never edited (the checksum is checked); add a new file instead. Write them so they can be re-run safely (`IF NOT EXISTS`), because MySQL DDL cannot be rolled back.
- **Never build SQL from text.** Always pass values as `?` parameters.
- **Logs** hold the method and a cleaned path only: no query strings, bodies, phone numbers, headers or parent-link tokens.
- **Money** is integer paise, times are UTC `DATETIME(3)`, ids are UUIDs, text is utf8mb4.
- **Production:** `TRUST_PROXY=true` (Coolify's proxy is in front), a real `DB_PASSWORD`, `DB_SSL` as your database requires.

## Deploy (Coolify on the VPS)

A `Dockerfile` is included. The container build has not been run on this Mac (no Docker installed), only the Node build and boot; Coolify will do the first real container build. Steps are in `docs/HOSTINGER-MIGRATION.md` once the repository and domain are ready.
