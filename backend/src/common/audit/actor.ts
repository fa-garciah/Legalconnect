/**
 * T061 — resolves who acted, for an audit entry.
 *
 * "Actor" identifies the acting principal WITHOUT embedding personal data beyond what
 * identification requires — so opaque identifiers, never a name or an email. That is
 * both FR-012 and the reason the audit query can be shown to a firm without a
 * redaction pass.
 */
import type { ActivePrincipal } from '../tenant/principal';

export interface AuditActor {
  readonly actorIdentityId: string | null;
  readonly actorMembershipId: string | null;
}

/** A person acting within a tenant. */
export function actorFromPrincipal(principal: ActivePrincipal): AuditActor {
  return {
    actorIdentityId: principal.identityId,
    actorMembershipId: principal.membershipId,
  };
}

/**
 * The system acting on its own behalf — a scheduled job, a migration, an internal
 * mechanism. Both fields null rather than a sentinel string, so "no human actor" is
 * queryable as `actor_identity_id IS NULL` instead of by matching a magic value.
 */
export const SYSTEM_ACTOR: AuditActor = {
  actorIdentityId: null,
  actorMembershipId: null,
};

/**
 * The platform administration context (research.md D9).
 *
 * Deliberately carries no membership: the Platform Operator's reach is not a
 * membership in any tenant, and recording one would misrepresent it as a member of the
 * firm it was acting on. Which operator acted belongs in `metadata` once slice 002
 * gives the platform surface real identities.
 */
export const PLATFORM_ACTOR: AuditActor = {
  actorIdentityId: null,
  actorMembershipId: null,
};

/**
 * The actor of a cross-tenant attempt, as seen by the TARGETED firm.
 *
 * Identity only, never the membership. The membership would name the tenant the actor
 * belongs to, and the targeted firm must not learn which other firm reached for its
 * matter (FR-023).
 */
export function actorForCrossTenantAttempt(identityId: string | null): AuditActor {
  return { actorIdentityId: identityId, actorMembershipId: null };
}
