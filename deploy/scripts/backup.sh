#!/usr/bin/env bash
# 024/US4, FR-013 — one backup of the LegalConnect database, taken so that it can be restored.
#
#   DATABASE_URL_BACKUP=postgresql://lc_migration:…@<postgres-host>:5432/legalconnect \
#   BACKUP_TARGET=s3://<bucket>/<prefix> deploy/scripts/backup.sh
#
# Runs on the Docker host (Dokploy's EC2), daily, from a Dokploy schedule or cron
# (specs/024-deployment-pipeline/quickstart.md says which). Writes
# legalconnect-<UTC yyyymmddThhmmssZ>.dump.gz to BACKUP_TARGET and prints its name.
#
# WHY NOT DOKPLOY'S OWN POSTGRES BACKUP: it runs `pg_dump --no-acl --no-owner`. LegalConnect's
# isolation is in the grants (lc_app owns nothing and reaches each table through a GRANT; the
# SECURITY DEFINER functions through EXECUTE), so such a dump restores without error into a database
# the application cannot use. This dump is `pg_dump -Fc` as the schema owner, ACLs and owners kept.
# deploy/scripts/restore-check.sh proves any backup; deploy/runbooks/restore.md uses it.
#
# A FAILED BACKUP LEAVES NOTHING BEHIND. The dump is written and gzip-tested in a private temp
# directory first and reaches BACKUP_TARGET only once pg_dump has exited 0, so a connection lost
# halfway can never sit in the bucket looking like a good backup. Exits non-zero on any failure.
#
# Environment:
#   DATABASE_URL_BACKUP  required. The schema owner's connection (the migration role): a dump taken
#                        as lc_app would be refused by RLS and could not read the ACLs anyway.
#   BACKUP_TARGET        required. s3://bucket[/prefix] in production; a local directory for tests.
#   BACKUP_NETWORK       Docker network that reaches PostgreSQL. Default: dokploy-network.
#   PG_IMAGE             Must be the server's major version or newer. Default: postgres:16.
#   AWS_CLI_IMAGE        Default: amazon/aws-cli:2.17.0.
#   BACKUP_KMS_KEY_ID    KMS key for SSE-KMS. Unset: the bucket's default aws/s3 key.
#   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN, AWS_ENDPOINT_URL
#                        passed through to the AWS CLI by NAME, never on a command line. With an EC2
#                        instance profile instead, the instance metadata hop limit must be 2 or more
#                        for a container to reach it.
set -euo pipefail

: "${DATABASE_URL_BACKUP:?set DATABASE_URL_BACKUP to the schema owner connection}"
: "${BACKUP_TARGET:?set BACKUP_TARGET to s3://bucket/prefix or a local directory}"
NETWORK="${BACKUP_NETWORK:-dokploy-network}"
PG_IMAGE="${PG_IMAGE:-postgres:16}"
AWS_CLI_IMAGE="${AWS_CLI_IMAGE:-amazon/aws-cli:2.17.0}"

NAME="legalconnect-$(date -u +%Y%m%dT%H%M%SZ).dump.gz"
WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

# The connection string travels as an environment variable NAME (-e VAR), so the password is in
# neither this script's nor docker's command line.
docker run --rm --network "$NETWORK" -e DATABASE_URL_BACKUP "$PG_IMAGE" \
  sh -c 'exec pg_dump --format=custom --dbname="$DATABASE_URL_BACKUP"' > "$WORK/dump"
gzip -9 < "$WORK/dump" > "$WORK/$NAME"
gzip -t "$WORK/$NAME"
rm -f "$WORK/dump"

SHA256="$(sha256sum "$WORK/$NAME" | cut -d' ' -f1)"
BYTES="$(wc -c < "$WORK/$NAME" | tr -d ' ')"

case "$BACKUP_TARGET" in
  s3://*)
    sse=(--sse aws:kms)
    [ -n "${BACKUP_KMS_KEY_ID:-}" ] && sse+=(--sse-kms-key-id "$BACKUP_KMS_KEY_ID")
    aws_env=()
    for var in AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_ENDPOINT_URL; do
      [ -n "${!var:-}" ] && aws_env+=(-e "$var")
    done
    # Fed on stdin from the finished, tested file: no bind mount, and the stream can no longer be
    # cut short by the database.
    docker run --rm -i "${aws_env[@]}" "$AWS_CLI_IMAGE" \
      s3 cp - "${BACKUP_TARGET%/}/$NAME" "${sse[@]}" \
      --metadata "sha256=$SHA256" --only-show-errors < "$WORK/$NAME"
    ;;
  *)
    mkdir -p "$BACKUP_TARGET"
    # Copy under a temporary name, then rename: a reader never sees a half-written file.
    cp "$WORK/$NAME" "$BACKUP_TARGET/.$NAME.partial"
    mv "$BACKUP_TARGET/.$NAME.partial" "$BACKUP_TARGET/$NAME"
    ;;
esac

echo "backup ${BACKUP_TARGET%/}/$NAME bytes=$BYTES sha256=$SHA256"
