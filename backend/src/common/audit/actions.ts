/**
 * The audit action vocabulary. FR-014 — seven actions.
 *
 * Two of them are channel-gated (FR-025, FR-026): an entry is written only for an
 * interactive read. That keeps what Principle V is after — a record that a *person*
 * looked — and drops what has none, since a monitoring job reading the log is not an
 * event a firm needs in its own history, and would otherwise grow the log it watches.
 */
export const AUDIT_ACTIONS = [
  // Slice 001 (FR-014, 001)
  'tenant.provisioned',
  'tenant.deactivated',
  'tenant.plan_changed',
  'plan.limits_changed',
  'tenant.cross_access_attempted',
  'audit.queried',
  'tenant.registry_read',
  // Slice 002 (FR-031). None of these nine is channel-gated — none is a read
  // of a monitorable log, so none carries the self-amplification risk the two
  // gates above exist to prevent. `identity.created`, `membership.created`,
  // `invitation.accepted` and `invitation.refused` are written by the
  // `accept_invitation()` SQL function itself (backend/drizzle/0015), not by
  // this TypeScript vocabulary at request time — they are listed here so the
  // check constraint in 0017 and this module stay in sync, and so
  // `TARGET_ENTITY_BY_ACTION` below has an entry for every action the audit
  // read surfaces can encounter.
  'identity.created',
  'membership.created',
  'membership.revoked',
  'membership.archetype_changed',
  'invitation.issued',
  'invitation.seed_issued',
  'invitation.revoked',
  'invitation.accepted',
  'invitation.refused',
  // Slice 017 (FR-003). Neither is channel-gated — neither is a read of a
  // monitorable log, the same reasoning the two gates above exist for.
  'position.created',
  'position.retired',
  'directory.position_assigned',
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
  'identity.created': 'identity',
  'membership.created': 'membership',
  'membership.revoked': 'membership',
  'membership.archetype_changed': 'membership',
  'invitation.issued': 'invitation',
  'invitation.seed_issued': 'invitation',
  'invitation.revoked': 'invitation',
  'invitation.accepted': 'invitation',
  'invitation.refused': 'invitation',
  'position.created': 'position',
  'position.retired': 'position',
  'directory.position_assigned': 'membership',
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
