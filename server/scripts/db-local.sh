#!/usr/bin/env bash
# A private MariaDB for tests and local development: its own folder (server/.localdb), port 3307, no system service.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.localdb/data"
SOCK="$ROOT/.localdb/mysql.sock"
PIDF="$ROOT/.localdb/mysql.pid"
PORT="${LOCAL_DB_PORT:-3307}"
BIN="${MARIADB_BIN:-/opt/homebrew/bin}"

up() { [ -S "$SOCK" ] && "$BIN/mariadb-admin" --socket="$SOCK" -uroot ping >/dev/null 2>&1; }

case "${1:-}" in
  start)
    if up; then echo "already running on port $PORT"; exit 0; fi
    mkdir -p "$ROOT/.localdb"
    if [ ! -d "$DATA/mysql" ]; then
      echo "creating the local database folder..."
      "$BIN/mariadb-install-db" --datadir="$DATA" --auth-root-authentication-method=normal --skip-test-db >/dev/null
    fi
    nohup "$BIN/mariadbd" --datadir="$DATA" --socket="$SOCK" --pid-file="$PIDF" --port="$PORT" --bind-address=127.0.0.1 \
      --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --skip-name-resolve >"$ROOT/.localdb/mysql.log" 2>&1 &
    for _ in $(seq 1 40); do up && break; sleep 0.5; done
    up || { echo "did not start; see .localdb/mysql.log"; exit 1; }
    "$BIN/mariadb" --socket="$SOCK" -uroot -e "CREATE DATABASE IF NOT EXISTS tutordesk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'tutordesk'@'127.0.0.1' IDENTIFIED BY 'tutordesk-local'; GRANT ALL ON \`tutordesk%\`.* TO 'tutordesk'@'127.0.0.1'; FLUSH PRIVILEGES;"
    echo "running on 127.0.0.1:$PORT (user tutordesk, local-only password)"
    ;;
  stop)
    if up; then "$BIN/mariadb-admin" --socket="$SOCK" -uroot shutdown && echo stopped; else echo "not running"; fi
    ;;
  status)
    if up; then echo "running on port $PORT"; else echo "stopped"; fi
    ;;
  *) echo "usage: db-local.sh start|stop|status"; exit 2 ;;
esac
