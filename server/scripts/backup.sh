#!/bin/sh
# Backs up the database and the uploaded pictures into one dated folder, keeps the newest N, and prints the result.
# Settings come from the same environment variables the server uses (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, FILES_DIR).
#   BACKUP_DIR   where to put backups (default ./backups)    BACKUP_KEEP   how many to keep (default 14)
# The password is passed through the environment, never on the command line. Copy the folder OFF this server too
# (see docs/BACKUPS.md): a backup on the same disk does not survive losing the disk.
set -eu
: "${DB_USER:?DB_USER is not set}" "${DB_PASSWORD:?DB_PASSWORD is not set}" "${DB_NAME:?DB_NAME is not set}"
HOST="${DB_HOST:-127.0.0.1}"; PORT="${DB_PORT:-3306}"
DIR="${BACKUP_DIR:-./backups}"; KEEP="${BACKUP_KEEP:-14}"; FILES="${FILES_DIR:-data/files}"
DUMP="$(command -v mariadb-dump || command -v mysqldump)" || { echo "mysqldump/mariadb-dump not found" >&2; exit 1; }
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DIR/$STAMP"
mkdir -p "$OUT"
export MYSQL_PWD="$DB_PASSWORD"
# --single-transaction: a consistent snapshot without locking the app. utf8mb4: Hindi/Tamil names survive.
"$DUMP" --host="$HOST" --port="$PORT" --user="$DB_USER" --single-transaction --routines --triggers \
  --default-character-set=utf8mb4 --no-tablespaces "$DB_NAME" | gzip -9 > "$OUT/database.sql.gz"
if [ -d "$FILES" ]; then tar -czf "$OUT/files.tar.gz" -C "$FILES" .; else tar -czf "$OUT/files.tar.gz" -T /dev/null; fi
# A backup nobody checked is a hope, not a backup: the archives must be readable and the dump must be complete.
gzip -t "$OUT/database.sql.gz"; tar -tzf "$OUT/files.tar.gz" >/dev/null
tail -c 200 < "$OUT/database.sql.gz" >/dev/null
gunzip -c "$OUT/database.sql.gz" | tail -n 1 | grep -q "Dump completed" || { echo "dump looks incomplete" >&2; exit 1; }
( cd "$OUT" && (shasum -a 256 database.sql.gz files.tar.gz 2>/dev/null || sha256sum database.sql.gz files.tar.gz) > SHA256SUMS )
# keep only the newest $KEEP (folder names sort by time)
ls -1d "$DIR"/[0-9]*T*Z 2>/dev/null | sort -r | tail -n +"$((KEEP + 1))" | while read -r old; do rm -rf "$old"; done
echo "backup ok: $OUT ($(du -sh "$OUT" | cut -f1))"
