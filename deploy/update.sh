#!/bin/sh
# Updates the bot on the server: the latest main, rebuild, restart (about a minute of downtime).
#   sh deploy/update.sh
set -eu
cd "$(dirname "$0")/.."
# Always main (releases are merged there), even if this checkout was on another branch
git fetch origin main
git checkout -q main
git merge --ff-only origin/main
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null
docker compose ps
echo "Updated. Follow the logs with: docker compose logs -f bot"
