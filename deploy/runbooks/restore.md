# Restoring the LegalConnect database from a backup

024/US4, SC-009. The manual form of [`deploy/scripts/restore-check.sh`](../scripts/restore-check.sh).
Read this before you need it, not during the incident.

## What a backup must be

A backup is usable only if it carries **grants and owners**. LegalConnect's isolation lives in them:
`lc_app` owns nothing and reaches each table only through an explicit `GRANT`, and the
`SECURITY DEFINER` functions (`resolve_session`, `accept_invitation`, `consume_step_up`, …) are
callable only by the roles granted `EXECUTE`. A dump taken with `--no-acl` or `--no-owner`
restores without a single error and leaves the application unable to read anything.

**Dokploy's built-in PostgreSQL backup is such a dump**: it runs
`pg_dump -Fc --no-acl --no-owner` (Dokploy source, `packages/server/src/utils/backups/utils.ts`,
read 2026-10-26). Do not rely on it. `restore-check.sh` rejects it — verified 2026-10-26, see
[quickstart-results.md](../../specs/024-deployment-pipeline/quickstart-results.md).

Accepted formats, both gzip-compressed: custom (`pg_dump -Fc`) or plain SQL (`pg_dump`), taken as the
schema owner, with ACLs and owners.

## Before restoring anything: prove the backup

On any machine with Docker and a checkout of this repository:

```bash
deploy/scripts/restore-check.sh /path/to/legalconnect-<timestamp>.dump.gz ghcr.io/fa-garciah/legalconnect-backend:sha-<commit>
```

Use the image of the release that was running when the backup was taken (Dokploy's deployment
history names it). The script restores into a throwaway PostgreSQL 16, compares its grants, owners,
policies and roles with a database migrated from scratch by that image, and runs `verify:role` and
`test:rls` against it. It never touches the database the backup came from. **If it fails, that
backup is not a restore candidate** — try the previous one.

## Restoring into production

Who: the CC technical lead, or someone they name in writing for this incident. Every step below is
destructive to the target database.

1. **Stop writes.** In Dokploy, stop the Compose service (frontend, backend). Leave PostgreSQL running.
2. **Keep what is there.** Take a dump of the current database the same way the backups are taken,
   even if it is damaged — it is evidence and may hold rows newer than the backup.
3. **Pick the backup** that passed `restore-check.sh`. Note its timestamp: everything written after
   it is lost unless recovered from step 2.
4. **Recreate the database** as the schema owner, connected to the `postgres` database:
   `DROP DATABASE legalconnect; CREATE DATABASE legalconnect OWNER lc_migration;`
   The roles survive a dropped database (they belong to the cluster), so there is nothing to recreate.
   On a *new* cluster, create them first exactly as `restore-check.sh` does (the `DO $$ … CREATE ROLE`
   blocks of the image's migrations).
5. **Restore**: `gzip -dc <backup> | pg_restore -U lc_migration -d legalconnect --exit-on-error --single-transaction`
   (custom format) or `gzip -dc <backup> | psql -v ON_ERROR_STOP=1 --single-transaction -U lc_migration -d legalconnect`
   (plain SQL).
6. **Start the Compose service.** `migrate` runs first: it resets the role passwords from Dokploy's
   environment and applies any migration newer than the backup. Then the API boots, and refuses to if
   its role is unsafe or its KMS key does not work.
7. **Check**: `GET /health` reports the expected `version`; sign in as a known user and open a
   matter's documents. Record the incident, the backup used and the data-loss window.

## TOTP secrets and KMS

Second-factor secrets are stored wrapped by the KMS key (`AUTH_KMS_KEY_ID`). A restored database is
usable only with **the same key**: restoring into an environment with a different key leaves every
enrolled person unable to complete MFA. This is intended (003/SC-008: a dump alone must not yield
working second factors). Never schedule a KMS key for deletion while backups wrapped under it are
retained.
