-- AuditEvent: one append-only record of one action. data-model.md.
--
-- Range-partitioned monthly on occurred_at (research.md D7). Retention drops
-- partitions rather than deleting rows — the application holds no DELETE grant, and
-- a mass delete over two years would be punishing anyway.

CREATE TABLE audit_event (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),

  -- FR-020: the timestamp comes from the DATABASE, never from the caller. Container
  -- clocks drift independently; ordering the log by a value each emitter chose for
  -- itself would make it unorderable in exactly the incident where order matters.
  -- clock_timestamp() rather than now(): now() is transaction-start, so two entries
  -- appended in one transaction would share a timestamp and FR-018 would fail.
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),

  tenant_id           uuid NOT NULL REFERENCES tenant (id),
  action              text NOT NULL,

  -- NULL when the actor is the system or the platform administration context.
  actor_identity_id   uuid,
  actor_membership_id uuid,

  target_entity       text NOT NULL,
  target_id           uuid,

  -- Origin as observed by the system. channel is load-bearing: FR-025 and FR-026
  -- gate two actions on it.
  source              jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- A partitioned table's primary key must contain the partition key, so id alone
  -- cannot be it. The pair still satisfies FR-018.
  PRIMARY KEY (occurred_at, id),

  CONSTRAINT audit_event_action_known CHECK (
    action IN (
      'tenant.provisioned',
      'tenant.deactivated',
      'tenant.plan_changed',
      'plan.limits_changed',
      'tenant.cross_access_attempted',
      'audit.queried',
      'tenant.registry_read'
    )
  ),

  CONSTRAINT audit_event_channel_present CHECK (source ? 'channel'),

  CONSTRAINT audit_event_target_entity_not_blank CHECK (length(btrim(target_entity)) >= 1)
) PARTITION BY RANGE (occurred_at);

-- Serves the tenant-scoped, time-bounded read of FR-013 and lets the planner prune.
CREATE INDEX audit_event_tenant_time_idx ON audit_event (tenant_id, occurred_at DESC);
CREATE INDEX audit_event_action_idx ON audit_event (tenant_id, action, occurred_at DESC);

COMMENT ON TABLE audit_event IS
  'Append-only. The application role holds INSERT and SELECT and no UPDATE or DELETE — FR-011 is enforced by the absent grant, not by an absent repository method.';
