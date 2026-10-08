#!/bin/sh
# Restores a backup folder into a database. It REFUSES to overwrite a database that already has tables unless you say so.
#   scripts/restore.sh <backup-folder> <target-database> [--files-dir <dir>] [--replace]
# Settings (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD) come from the environment, as for the server.
set -eu
BK="${1:?usage: restore.sh <backup-folder> <target-database> [--files-dir <dir>] [--replace]}"; TARGET="${2:?target database name missing}"; shift 2
FILES=""; REPLACE=0
while [ $# -gt 0 ]; do case "$1" in --files-dir) FILES="$2"; shift 2;; --replace) REPLACE=1; shift;; *) echo "unknown option $1" >&2; exit 2;; esac; done
: "${DB_USER:?DB_USER is not set}" "${DB_PASSWORD:?DB_PASSWORD is not set}"
HOST="${DB_HOST:-127.0.0.1}"; PORT="${DB_PORT:-3306}"
CLI="$(command -v mariadb || command -v mysql)"
export MYSQL_PWD="$DB_PASSWORD"
case "$TARGET" in *[!A-Za-z0-9_]*|"") echo "database name: letters, digits and underscore only" >&2; exit 2;; esac
( cd "$BK" && (shasum -a 256 -c SHA256SUMS 2>/dev/null || sha256sum -c SHA256SUMS) >/dev/null ) || { echo "backup files do not match their checksums; refusing" >&2; exit 1; }
TABLES="$("$CLI" --host="$HOST" --port="$PORT" --user="$DB_USER" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$TARGET'")"
if [ "$TABLES" != "0" ] && [ "$REPLACE" != "1" ]; then echo "database $TARGET already has $TABLES tables; use --replace to overwrite it" >&2; exit 1; fi
"$CLI" --host="$HOST" --port="$PORT" --user="$DB_USER" -e "DROP DATABASE IF EXISTS \`$TARGET\`; CREATE DATABASE \`$TARGET\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
gunzip -c "$BK/database.sql.gz" | "$CLI" --host="$HOST" --port="$PORT" --user="$DB_USER" --default-character-set=utf8mb4 "$TARGET"
if [ -n "$FILES" ]; then mkdir -p "$FILES"; tar -xzf "$BK/files.tar.gz" -C "$FILES"; fi
echo "restored into $TARGET ($("$CLI" --host="$HOST" --port="$PORT" --user="$DB_USER" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$TARGET'") tables)"
