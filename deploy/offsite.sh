#!/bin/sh
# Offsite container (docker-compose.yml): copies new backups from ./backups to a Cloud Storage
# bucket every hour, so losing the VM's disk doesn't lose the backups. Old copies are removed by
# the bucket's own lifecycle rule (30 days, docs/DEPLOY.md), never by this script.
# Signs in as the VM's service account (needs the Storage "Read Write" access scope).
BUCKET="${BACKUP_BUCKET:-}"
if [ -z "$BUCKET" ]; then
  echo "offsite: BACKUP_BUCKET is not set, so backups stay on this disk only"
  exec sleep infinity
fi

echo "offsite: copying backups to gs://${BUCKET}/backups/ every hour"
while true; do
  # rsync only uploads files the bucket doesn't have yet; nothing is deleted on either side.
  # Dumps still being written end in .partial (deploy/backup.sh) and are skipped.
  if gcloud storage rsync /backups "gs://${BUCKET}/backups" --exclude='.*\.partial$' --quiet; then
    echo "offsite: in sync ($(date -u +%H:%M) UTC)"
  else
    echo "offsite: FAILED to copy to gs://${BUCKET}. Check the VM's access scopes and the bucket name."
  fi
  sleep 3600
done
