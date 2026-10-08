# Runs inside the "backup" service of the Coolify stack (see coolify-compose.json). Every 24 hours it:
#   1. takes a backup (database + pictures) with scripts/backup.sh into the persistent "backups" volume,
#   2. restores that backup into a scratch database and compares the table count with the live database,
#   3. drops the scratch database and logs the result ("restore check: live=N restored=N").
# Lines containing BACKUP FAILED or RESTORE CHECK FAILED in the service's logs mean something needs attention.
mkdir -p /etc/my.cnf.d && printf '[client]\nskip-ssl\n' > /etc/my.cnf.d/zz-internal.cnf
while true; do
  echo "backup started $(date -u +%FT%TZ)"
  if sh scripts/backup.sh; then
    B=$(ls -1d /data/backups/*T*Z | sort | tail -n 1)
    export MYSQL_PWD="$DB_ROOT_PASSWORD"
    mariadb -h db -uroot -e "DROP DATABASE IF EXISTS backup_verify"
    if DB_USER=root DB_PASSWORD="$DB_ROOT_PASSWORD" sh scripts/restore.sh "$B" backup_verify; then
      L=$(mariadb -h db -uroot -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='chalkpis'")
      R=$(mariadb -h db -uroot -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='backup_verify'")
      echo "restore check: live=$L restored=$R"
      [ "$L" = "$R" ] && [ "$R" -gt 0 ] || echo "RESTORE CHECK FAILED"
    else
      echo "RESTORE CHECK FAILED"
    fi
    mariadb -h db -uroot -e "DROP DATABASE IF EXISTS backup_verify"
  else
    echo "BACKUP FAILED"
  fi
  sleep 86400
done
