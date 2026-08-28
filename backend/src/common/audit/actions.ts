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
  // Slice 006 (FR-022 to FR-024). Eleven mutations plus one ACCESS record.
  'client.created',
  'client.updated',
  'client.deactivated',
  // FR-004a. Its own action rather than a `client.updated` carrying a status field: the
  // withdraw/restore round trip has to be legible in the trail, and a status change
  // buried in an update's metadata is not.
  'client.reactivated',
  'case.created',
  // FR-023. The one ACCESS record in this slice, and the first anywhere in the product.
  // Principle V requires recording every access to CASES, not only their modification,
  // and this is the slice that first owns an entity that clause names. Channel-gated
  // below, for the reason the two 001 gates exist.
  'case.read',
  'case.status_changed',
  'case.team_member_assigned',
  // Also written by the revocation cascade (FR-012a), deliberately reusing this action
  // rather than adding a distinct one: the event is the same — a person came off a
  // matter — and the entry's actor plus the neighbouring `membership.revoked` in the same
  // transaction already name the cause (research.md D8).
  'case.team_member_unassigned',
  // Three actions for three catalogs, with `target_entity` naming which one. Nine would be
  // vocabulary growth with no read that benefits: the audit surface already filters by
  // target entity, so `case.catalog_entry_retired` + `venue` answers "who retired a court".
  'case.catalog_entry_created',
  // FR-008a. Only ever carries `case_status` — `is_closing` is the sole editable field on
  // any catalog entry, and only that catalog has it.
  'case.catalog_entry_updated',
  'case.catalog_entry_retired',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Actions written only when `source.channel === 'interactive'`.
 *
 * `case.read` joins 001's two (006/FR-023). Principle V wants a record that a PERSON
 * opened a matter; an ungated read action would let a monitoring job inflate the log it
 * watches, which is the whole reason the first two gates exist. The case LIST read is not
 * here because it is not audited at all — it returns only rows the caller is already
 * scoped to and discloses no matter's contents (006/spec.md, Resolved Decisions).
 */
export const CHANNEL_GATED_ACTIONS: ReadonlySet<AuditAction> = new Set<AuditAction>([
  'audit.queried',
  'tenant.registry_read',
  'case.read',
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
  // Slice 006. The relation is `case_file` (CASE is reserved — 006/research.md D4), and
  // the target entity names the relation so an audit read can join to it.
  'client.created': 'client',
  'client.updated': 'client',
  'client.deactivated': 'client',
  'client.reactivated': 'client',
  'case.created': 'case_file',
  'case.read': 'case_file',
  'case.status_changed': 'case_file',
  // The subject of a team change is the MEMBERSHIP whose place on the matter changed, not
  // the case — the same choice `directory.position_assigned` above makes for the analogous
  // change. The case is carried in the entry's metadata.
  'case.team_member_assigned': 'membership',
  'case.team_member_unassigned': 'membership',
  // Set per call — one action serves all three catalogs, and the target entity is what
  // distinguishes `case_status` from `matter_type` from `venue` (006/research.md D8).
  'case.catalog_entry_created': 'unknown',
  'case.catalog_entry_updated': 'case_status',
  'case.catalog_entry_retired': 'unknown',
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
