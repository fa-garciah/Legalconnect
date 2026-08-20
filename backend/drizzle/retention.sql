-- T091 — the retention job. FR-019: entries past 24 months are removed by a defined
-- routine the application cannot invoke.
--
-- This is deliberately thin. audit_event_drop_expired_partitions(int) already exists
-- (0004_audit_partitions.sql, made SECURITY DEFINER by 0010 so DETACH/DROP succeed
-- under a caller who does not own the table) and already carries the actual logic —
-- detach, then drop, one partition per month past the window. This script is the
-- scheduled entry point: run it against DATABASE_URL_RETENTION, on a schedule, from
-- infra (infra/retention-schedule.tf). It holds no logic of its own to keep the
-- routine itself in one place, verified once by tests/integration/audit-retention.test.ts
-- rather than duplicated between a script and its test.
--
-- Not a numbered migration: this is invoked repeatedly, on a schedule, not once at
-- deploy time, so it does not belong in the schema_migration ledger.

SELECT audit_event_drop_expired_partitions(24);
