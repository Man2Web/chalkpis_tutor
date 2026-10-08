# Backups and restore

Fee records and student data live in two places on the server: the **database** and the **uploaded pictures** (logos and student photos, in `FILES_DIR`). Both are backed up together by one script.

## What is checked on every backup

`server/scripts/backup.sh` writes a dated folder (`20261008T100943Z`) containing `database.sql.gz`, `files.tar.gz` and `SHA256SUMS`, then:

- tests that both archives can be read and that the database dump ends with MariaDB's "Dump completed" line (a half-written dump is refused);
- records checksums, so a damaged copy is caught before a restore;
- keeps the newest 14 and deletes older ones (`BACKUP_KEEP`).

The database is dumped with a consistent snapshot (the app keeps working) and in UTF-8, so Hindi and Tamil names survive. This was tested by backing up a database holding Tamil and Hindi text and restoring it into a second database: the rows, the table count and the picture file all came back identical.

## Set it up (Coolify)

1. **Database backups (recommended first step):** in Coolify open the database resource, then **Backups**, add a **daily** schedule, and choose an **S3-compatible destination** (for example a Hostinger Object Storage bucket, Cloudflare R2 or Backblaze B2). That copy lives off the VPS.
2. **Pictures and a second copy of the database:** in the API application, add a **Scheduled Task** (daily, 02:30) with the command

   ```
   sh scripts/backup.sh
   ```

   and set `BACKUP_DIR` to a mounted volume (for example `/data/backups`). The task uses the same `DB_*` and `FILES_DIR` settings as the server.

3. **Copy off the server.** A backup on the same disk does not survive losing the disk. Use Coolify's S3 destination, or copy `/data/backups` to your Mac or a cloud drive weekly.

## Restore (practise this once, before you need it)

Restore into a **new, empty database first** and look at it. Never restore over the live one while the app is running.

```
DB_USER=... DB_PASSWORD=... sh scripts/restore.sh /data/backups/20261008T100943Z tutordesk_check --files-dir /tmp/files_check
```

The script refuses to run if the checksums do not match, and refuses to overwrite a database that already has tables unless you add `--replace`.

To go live from a backup: stop the API, restore into the real database name with `--replace` (and `--files-dir` set to `FILES_DIR`), start the API. Migrations that were added after the backup are applied automatically on start.

## What a backup does not contain

Settings and secrets (`JWT_SECRET`, WhatsApp, Razorpay): keep those in your password manager. Without `JWT_SECRET` the app still works after a restore, but everyone has to sign in again.
