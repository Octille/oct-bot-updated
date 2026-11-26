#!/bin/sh
# Puts the database back to a backup taken with scripts/copy-live-db.sh (Phase 7d rollback).
# Run on the server, from ~/oct-bot-updated:
#
#   sh deploy/rollback.sh backups/live-20261201-120000.archive.gz
#
# Needs the matching <archive>.collections.txt next to it. Stops the bot, restores the backup
# (--drop replaces every collection in it), then drops every collection that wasn't in the database
# when the backup was taken (mongorestore leaves those alone, e.g. the ones v3 created).
set -eu
cd "$(dirname "$0")/.."

ARCHIVE="${1:-}"
LIST="$ARCHIVE.collections.txt"
case "$ARCHIVE" in backups/*) ;; *) echo "Give the backup's path inside backups/, e.g. backups/live-….archive.gz"; exit 1 ;; esac
[ -f "$ARCHIVE" ] || { echo "No file $ARCHIVE"; exit 1; }
[ -s "$LIST" ] || { echo "No collection list $LIST (made by scripts/copy-live-db.sh). Without it, collections added since the backup would stay."; exit 1; }

echo "This REPLACES the database in MONGODB_URI (.env) with $ARCHIVE"
echo "and drops every collection not listed in $LIST:"
sed 's/^/  keep: /' "$LIST"
printf 'Type ROLLBACK to go ahead: '
read -r answer
[ "$answer" = "ROLLBACK" ] || { echo "Cancelled."; exit 1; }

docker compose stop bot
NAME="$(basename "$ARCHIVE")"
docker compose run --rm -T -e KEEP="$(cat "$LIST")" -e NAME="$NAME" --entrypoint sh backup -c '
  set -e
  mongorestore --uri "$MONGODB_URI" --archive="/backups/$NAME" --gzip --drop
  mongosh "$MONGODB_URI" --quiet --eval "
    const keep = process.env.KEEP.split(\"\\n\");
    for (const c of db.getCollectionNames()) {
      if (keep.includes(c) || c.startsWith(\"system.\")) continue;
      print(\"dropping \" + c);
      db.getCollection(c).drop();
    }
    print(\"collections now: \" + db.getCollectionNames().length);
  "
'
echo "Restored. The bot is stopped. To bring it back: docker compose start bot"
