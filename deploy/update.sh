#!/bin/sh
# Updates the bot on the server: pull the latest code, rebuild, restart (about a minute of downtime).
#   sh deploy/update.sh
set -eu
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null
docker compose ps
echo "Updated. Follow the logs with: docker compose logs -f bot"
