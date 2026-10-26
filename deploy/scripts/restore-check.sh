#!/usr/bin/env bash
# 024/US4, SC-009 — proves a PostgreSQL backup restores into a working, still-isolated database.
#
#   deploy/scripts/restore-check.sh <backup.dump.gz | backup.sql.gz> [backend-image]
#
# Restores the backup into a throwaway PostgreSQL 16, then fails unless ALL of these hold:
#   1. it restores with no error;
#   2. its security configuration — table/sequence/function ACLs, owners, RLS flags, policies,
#      schema and default privileges, role attributes and memberships — is IDENTICAL to a database
#      migrated from scratch by the same backend image (catches a dump taken with --no-acl, which
#      restores cleanly and leaves lc_app unable to read anything);
#   3. `npm run verify:role` and `npm run test:rls` pass against it.
# Nothing touches the database the backup came from. Needs docker; reads the repository's backend/
# for the two test suites. Exits non-zero on any failure, and always removes what it started.
#
# Why roles are created first: lc_app, lc_auth & co. are cluster-level objects. A database dump
# carries the GRANTs to them but never the CREATE ROLE, so a restore into an empty cluster fails on
# the first grant. They are taken from the backend image's own migrations (every `DO $$ … $$` block
# that creates a role), so the set cannot drift from what the migrations define. Passwords are then
# set by running the image's migrate, exactly as a deployment does.
set -euo pipefail

BACKUP="${1:?usage: restore-check.sh <backup.dump.gz|backup.sql.gz> [backend-image]}"
IMAGE="${2:-ghcr.io/fa-garciah/legalconnect-backend:main}"
OWNER="${RESTORE_OWNER:-lc_migration}"   # the role that owns the schema in production
DB="${RESTORE_DB:-legalconnect}"
BACKEND_DIR="${BACKEND_DIR:-$(cd "$(dirname "$0")/../../backend" && pwd)}"
NODE_MODULES_VOLUME="${NODE_MODULES_VOLUME:-lc-backend-linux-nm}"

[ -f "$BACKUP" ] || { echo "no such backup: $BACKUP" >&2; exit 2; }

RUN="lc-restore-check-$$"
NET="$RUN-net"
PW="$(head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n')"   # throwaway, never printed
WORK="$(mktemp -d)"

cleanup() {
  docker rm -f "$RUN-restored" "$RUN-reference" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

step() { printf '\n== %s\n' "$*"; }

start_postgres() {
  docker run -d --name "$1" --network "$NET" \
    -e POSTGRES_USER="$OWNER" -e POSTGRES_PASSWORD="$PW" -e POSTGRES_DB="$DB" \
    postgres:16 >/dev/null
  for _ in $(seq 1 60); do
    docker exec "$1" pg_isready -U "$OWNER" -d "$DB" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "$1 did not become ready" >&2
  exit 1
}

psql_in() { docker exec -i "$1" psql -X -q -v ON_ERROR_STOP=1 -U "$OWNER" -d "$DB" "${@:2}"; }

migrate() {
  docker run --rm --network "$NET" \
    -e DATABASE_URL_MIGRATION="postgresql://$OWNER:$PW@$1:5432/$DB" \
    -e LC_APP_PASSWORD="$PW" -e LC_PLATFORM_PASSWORD="$PW" \
    -e LC_RETENTION_PASSWORD="$PW" -e LC_AUTH_PASSWORD="$PW" \
    "$IMAGE" node dist/drizzle/migrate.js
}

# The security configuration only — never row data. Partitions are excluded because the API creates
# upcoming audit partitions at boot, so a live database legitimately has more than a fresh one.
fingerprint() {
  psql_in "$1" -At <<'SQL'
SELECT 'rel', c.relname::text, c.relkind::text, pg_get_userbyid(c.relowner)::text,
       coalesce(c.relacl::text, ''),
       c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','S','f')
   AND NOT c.relispartition
UNION ALL
SELECT 'fn', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', p.prokind::text,
       pg_get_userbyid(p.proowner)::text, coalesce(p.proacl::text, ''), p.prosecdef, NULL
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
UNION ALL
SELECT 'policy', tablename || '.' || policyname, cmd::text, permissive::text,
       array_to_string(roles, ','),
       NULL, NULL
  FROM pg_policies WHERE schemaname = 'public'
UNION ALL
SELECT 'policy-expr', tablename || '.' || policyname, coalesce(qual, ''), coalesce(with_check, ''),
       NULL, NULL, NULL
  FROM pg_policies WHERE schemaname = 'public'
UNION ALL
SELECT 'schema', nspname::text, NULL, pg_get_userbyid(nspowner)::text, coalesce(nspacl::text, ''),
       NULL, NULL
  FROM pg_namespace WHERE nspname = 'public'
UNION ALL
SELECT 'default-acl', pg_get_userbyid(defaclrole)::text, defaclobjtype::text, NULL, defaclacl::text,
       NULL, NULL
  FROM pg_default_acl
UNION ALL
SELECT 'role', rolname::text, NULL, NULL,
       concat_ws(',', rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls),
       NULL, NULL
  FROM pg_roles WHERE rolname LIKE 'lc\_%' AND rolname <> current_user
UNION ALL
SELECT 'member', pg_get_userbyid(roleid)::text, pg_get_userbyid(member)::text, NULL, NULL, NULL, NULL
  FROM pg_auth_members
 WHERE pg_get_userbyid(roleid) LIKE 'lc\_%' OR pg_get_userbyid(member) LIKE 'lc\_%'
ORDER BY 1, 2, 3, 4, 5;
SQL
}

step "backup: $BACKUP"
step "image: $IMAGE"
docker network create "$NET" >/dev/null
start_postgres "$RUN-restored"
start_postgres "$RUN-reference"

step "roles, from the image's migrations"
docker run --rm --entrypoint sh "$IMAGE" -c 'cat dist/drizzle/*.sql' \
  | awk '/^DO \$\$/ { buf = ""; inblock = 1 }
         inblock     { buf = buf $0 "\n" }
         inblock && /^END \$\$;/ { if (buf ~ /CREATE ROLE/) printf "%s", buf; inblock = 0 }' \
  > "$WORK/roles.sql"
grep -c 'CREATE ROLE' "$WORK/roles.sql" | sed 's/^/role blocks: /'
psql_in "$RUN-restored" < "$WORK/roles.sql"

step "restore"
if [ "$(gzip -dc "$BACKUP" | head -c 5)" = "PGDMP" ]; then
  gzip -dc "$BACKUP" | docker exec -i "$RUN-restored" \
    pg_restore -U "$OWNER" -d "$DB" --exit-on-error --single-transaction
else
  gzip -dc "$BACKUP" | psql_in "$RUN-restored" --single-transaction
fi
psql_in "$RUN-restored" -At -c \
  "SELECT 'migrations recorded: ' || count(*) FROM schema_migration"

step "passwords and any pending migration (restored)"
migrate "$RUN-restored"
step "reference: the same image, migrated from nothing"
migrate "$RUN-reference"

step "security configuration: restored vs reference"
fingerprint "$RUN-restored" > "$WORK/restored.txt"
fingerprint "$RUN-reference" > "$WORK/reference.txt"
if ! diff -u "$WORK/reference.txt" "$WORK/restored.txt"; then
  echo "FAIL: the restored database's grants, owners, policies or roles differ from what the" >&2
  echo "      migrations define (- reference, + restored). The backup is not a usable restore." >&2
  exit 1
fi
echo "identical ($(wc -l < "$WORK/reference.txt") entries)"

step "verify:role and test:rls against the restored database"
url() { echo "postgresql://$1:$PW@$RUN-restored:5432/$DB"; }
docker run --rm --network "$NET" \
  -v "$BACKEND_DIR:/app" -v "$NODE_MODULES_VOLUME:/app/node_modules" -w /app \
  -e DATABASE_URL_MIGRATION="$(url "$OWNER")" -e DATABASE_URL_APP="$(url lc_app)" \
  -e DATABASE_URL_PLATFORM="$(url lc_platform)" -e DATABASE_URL_RETENTION="$(url lc_retention)" \
  -e DATABASE_URL_AUTH="$(url lc_auth)" \
  node:22-bookworm-slim sh -c '
    [ -x node_modules/.bin/vitest ] || npm ci --no-audit --no-fund >/dev/null
    npx vitest run tests/integration/verify-role.test.ts tests/integration/rls-coverage.test.ts'

step "PASS: $BACKUP restores into a database identical in security configuration to a fresh one"
