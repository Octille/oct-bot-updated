#!/bin/sh
# Backup container (docker-compose.yml): a mongodump of MONGODB_URI once a day at BACKUP_HOUR (UTC,
# default 4), kept for BACKUP_KEEP_DAYS days (default 14), in ./backups on the server.
URI="${MONGODB_URI:-$MONGODB_SRV}"
HOUR="${BACKUP_HOUR:-4}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
[ -n "$URI" ] || { echo "backup: MONGODB_URI is not set"; sleep 3600; exit 1; }

dump() {
  FILE="/backups/octbot-$(date -u +%Y%m%d-%H%M%S).archive.gz"
  # Written under a .partial name first, so the offsite copy never uploads half a dump
  if mongodump --uri "$URI" --archive="$FILE.partial" --gzip --quiet && mv "$FILE.partial" "$FILE"; then
    echo "backup: wrote $FILE ($(du -h "$FILE" | cut -f1))"
  else
    echo "backup: FAILED"; rm -f "$FILE.partial"
  fi
  find /backups -name 'octbot-*.archive.gz' -mtime +"$KEEP" -delete
}

echo "backup: daily at ${HOUR}:00 UTC, keeping ${KEEP} days"
while true; do
  # Sleep until the next BACKUP_HOUR:00 UTC
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%Y-%m-%d) ${HOUR}:00:00" +%s)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  dump
done
