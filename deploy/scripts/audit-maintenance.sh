#!/usr/bin/env bash
# 024 — the audit log's two scheduled duties, which the infrastructure used to promise and the
# Dokploy deployment (D1) does not provide by itself. Run daily on the host, beside backup.sh.
#
#   DATABASE_URL_RETENTION=postgresql://lc_retention:…@<postgres-host>:5432/legalconnect \
#   deploy/scripts/audit-maintenance.sh [backend-image]
#
# 1. KEEP PARTITIONS AHEAD OF NEED. audit_event is partitioned by month. The API creates the current
#    month and the next two when it boots (src/modules/audit/partition-maintenance.ts), but a
#    container that runs more than two months without a redeploy reaches a month with no partition,
#    and from that moment every audited action fails. This creates them daily instead.
# 2. RETENTION (001/FR-019). Entries past 24 months are removed by "a defined deletion routine" the
#    application cannot invoke. infra/retention-schedule.tf scheduled it with EventBridge against RDS;
#    with neither in use (D1, D2), this is that schedule. It runs backend/drizzle/retention.sql taken
#    from the backend image itself, so the routine has one source.
#
# Connects as lc_retention, which holds EXECUTE on exactly these two SECURITY DEFINER functions and
# which the application deliberately does not hold (DATABASE_URL_RETENTION is in no container).
#
# Environment: DATABASE_URL_RETENTION (required); BACKUP_NETWORK (default dokploy-network);
# PG_IMAGE (default postgres:16).
set -euo pipefail

: "${DATABASE_URL_RETENTION:?set DATABASE_URL_RETENTION to the lc_retention connection}"
IMAGE="${1:-ghcr.io/fa-garciah/legalconnect-backend:main}"
NETWORK="${BACKUP_NETWORK:-dokploy-network}"
PG_IMAGE="${PG_IMAGE:-postgres:16}"

# Keep equal to PARTITION_LOOKAHEAD_MONTHS in src/modules/audit/partition-maintenance.ts.
LOOKAHEAD_MONTHS=2

RETENTION_SQL="$(docker run --rm --entrypoint cat "$IMAGE" dist/drizzle/retention.sql)"

# psql prints what each function returns: the three partitions that now exist ahead (whether created
# today or already there), then any partition retention dropped — so the schedule's log says what
# happened.
{
  printf "SELECT audit_event_ensure_partition((date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => m))::date)\n"
  printf "  FROM generate_series(0, %d) AS m;\n" "$LOOKAHEAD_MONTHS"
  printf '%s\n' "$RETENTION_SQL"
} | docker run --rm -i --network "$NETWORK" -e DATABASE_URL_RETENTION "$PG_IMAGE" \
  sh -c 'exec psql -X -q -At -v ON_ERROR_STOP=1 --dbname="$DATABASE_URL_RETENTION"'

echo "audit maintenance done"
