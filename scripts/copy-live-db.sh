#!/bin/sh
# Copies the live (Atlas) database into a local one for the migration dry-run. Read-only on live.
# Also keeps the dump as a backup file.
#
#   sh scripts/copy-live-db.sh                 # uses MONGODB_SRV from .env, restores into octbot_v2copy
#   sh scripts/copy-live-db.sh octbot_v2copy2  # a different local database name
#
# Needs the octbot-mongo container (docker compose up mongo) for mongodump/mongorestore.
set -eu
cd "$(dirname "$0")/.."

TARGET_DB="${1:-octbot_v2copy}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/octbot-backups}"
LIVE_URI="$(sed -n 's/^MONGODB_SRV=//p' .env | tail -1)"
[ -n "$LIVE_URI" ] || { echo "MONGODB_SRV is not set in .env"; exit 1; }
# Database name from the URI path (mongodb+srv://user:pass@host/<db>?options)
LIVE_DB="$(printf '%s' "$LIVE_URI" | sed -E 's#^[^/]*//[^/]*/?##; s#\?.*$##')"
[ -n "$LIVE_DB" ] || LIVE_DB=test

mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/live-$(date +%Y%m%d-%H%M%S).archive.gz"
echo "Dumping live database \"${LIVE_DB}\" (read-only) to ${FILE}…"
docker exec -e LIVE_URI="$LIVE_URI" octbot-mongo sh -c 'mongodump --uri "$LIVE_URI" --archive --gzip --readPreference=secondaryPreferred' > "$FILE"

echo "Restoring into local database \"${TARGET_DB}\" (replacing it)…"
docker exec -i octbot-mongo mongorestore --archive --gzip --drop --nsFrom "$LIVE_DB.*" --nsTo "$TARGET_DB.*" < "$FILE"

echo "Done. Dry run:"
echo "  npx tsx scripts/migrate-v2-to-v3.ts --uri \"mongodb://localhost:27017/$TARGET_DB?directConnection=true\" --dry-run --json migration-summary.json"
