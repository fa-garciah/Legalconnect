#!/usr/bin/env bash
# PROTOTYPE ONLY — the nightly database backup as a service of the Dokploy compose, for a host where
# the cron of quickstart.md §8 cannot be installed (no SSH). Same dump as deploy/scripts/backup.sh:
# `pg_dump -Fc` as the schema owner, ACLs and owners kept, gzip-tested before it is uploaded, so a
# failed run leaves nothing in the bucket that looks like a good backup.
#
# What it gives up against the constitution's rule, knowingly: the dump goes to the documents
# bucket under `backups/` with the bucket's default encryption, not to a separate bucket under its
# own KMS key (infra/backups.tf). Retire it once that bucket exists and the host cron runs.
#
#   DATABASE_URL_BACKUP   the migration role's connection
#   BACKUP_BUCKET         bucket name; objects go to backups/legalconnect-<UTC>.dump.gz
#   AWS_DEFAULT_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY   read by the AWS CLI by name
#   BACKUP_AT_UTC         HH:MM, default 09:15 (03:15 in Mexico City)
#   RUN_ONCE=1            take one backup now and exit (used to test it)
set -euo pipefail

: "${DATABASE_URL_BACKUP:?}"
: "${BACKUP_BUCKET:?}"
AT="${BACKUP_AT_UTC:-09:15}"

backup_once() {
  local stamp work name
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  name="legalconnect-${stamp}.dump.gz"
  work="$(mktemp -d)"
  pg_dump --format=custom --dbname="$DATABASE_URL_BACKUP" | gzip -9 > "$work/$name"
  gzip -t "$work/$name"
  aws s3 cp "$work/$name" "s3://${BACKUP_BUCKET}/backups/${name}" --only-show-errors
  rm -rf "$work"
  echo "backup ok: s3://${BACKUP_BUCKET}/backups/${name}"
}

if [ "${RUN_ONCE:-}" = "1" ]; then
  backup_once
  exit 0
fi

echo "nightly backup at ${AT} UTC"
while true; do
  now="$(date -u +%s)"
  next="$(date -u -d "today ${AT}" +%s)"
  [ "$next" -le "$now" ] && next="$(date -u -d "tomorrow ${AT}" +%s)"
  sleep $(( next - now ))
  backup_once || echo "backup FAILED at $(date -u +%FT%TZ)" >&2
done
