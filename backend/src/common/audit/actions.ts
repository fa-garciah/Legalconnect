/**
 * The audit action vocabulary. FR-014 — seven actions.
 *
 * Two of them are channel-gated (FR-025, FR-026): an entry is written only for an
 * interactive read. That keeps what Principle V is after — a record that a *person*
 * looked — and drops what has none, since a monitoring job reading the log is not an
 * event a firm needs in its own history, and would otherwise grow the log it watches.
 */
export const AUDIT_ACTIONS = [
  'tenant.provisioned',
  'tenant.deactivated',
  'tenant.plan_changed',
  'plan.limits_changed',
  'tenant.cross_access_attempted',
  'audit.queried',
  'tenant.registry_read',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Actions written only when `source.channel === 'interactive'`. */
export const CHANNEL_GATED_ACTIONS: ReadonlySet<AuditAction> = new Set<AuditAction>([
  'audit.queried',
  'tenant.registry_read',
]);

export const TARGET_ENTITY_BY_ACTION: Readonly<Record<AuditAction, string>> = {
  'tenant.provisioned': 'tenant',
  'tenant.deactivated': 'tenant',
  'tenant.plan_changed': 'tenant',
  'plan.limits_changed': 'plan',
  // Set per call — the attempt names whatever was reached for.
  'tenant.cross_access_attempted': 'unknown',
  'audit.queried': 'audit_event',
  'tenant.registry_read': 'tenant',
};

export type Channel = 'interactive' | 'automated';

/**
 * Whether this action should produce an entry for this channel.
 *
 * Note both directions matter and are tested as such: an implementation that
 * recorded nothing at all would satisfy "automated reads are silent" while breaking
 * FR-014.
 */
export function shouldEmit(action: AuditAction, channel: Channel): boolean {
  if (!CHANNEL_GATED_ACTIONS.has(action)) return true;
  return channel === 'interactive';
}
