/**
 * What the tenant-context mechanism receives, and what it guarantees.
 *
 * This slice authenticates nothing — it is handed an already-authenticated principal.
 * The seam is specified in contracts/tenant-context.md; these are its types.
 */
import type { PlanLimits } from '../db/schema';
/**
 * The ten membership-capable archetype codes fixed by Constitution v1.4.0
 * Principle IV. `CC` (Corporate Client) was added in slice 002 — research.md
 * D9 — closing a gap against the constitution's own table; `PO` is not a
 * membership at all and never appears here.
 */
export type Archetype = 'SA' | 'MP' | 'AA' | 'PL' | 'CM' | 'BM' | 'CC' | 'IC' | 'CB' | 'EL';

export type Channel = 'interactive' | 'automated';

/** Supplied by slice 002/003. Holds no tenant — an identity may have several. */
export interface AuthenticatedIdentity {
  readonly identityId: string;
}

/** The resolved, verified pairing of one identity with one tenant. */
export interface ActivePrincipal {
  readonly identityId: string;
  readonly membershipId: string;
  readonly tenantId: string;
  readonly archetype: Archetype;
  /**
   * 004, research.md D7. Optional for the same reason `MembershipRecord`'s own plan
   * fields are (`common/tenant/membership.ts`): every principal literal constructed
   * directly by a pre-004 test fixture must keep compiling untouched (SC-017). Absent
   * or `null` both mean "no plan resolved," which `AuthorizationInterceptor`'s
   * `decide()` call treats as fail-closed for any capability carrying a `tier` or
   * `limit` key.
   */
  readonly plan?: { readonly entitlements: Record<string, boolean>; readonly limits: PlanLimits } | null;
}

export interface RequestOrigin {
  readonly channel: Channel;
  readonly clientClass?: string;
  readonly networkOrigin?: string;
}

/**
 * Why an activation was refused. Distinguished because they audit and answer
 * differently.
 *
 * `mfa_not_enrolled` (slice 002, FR-026, research.md D5) is the one refusal
 * that does not answer the generic tenant-context `404`: reaching it is proof
 * the caller already holds a genuine, live, resolved membership, so there is
 * no tenant-existence question left to protect.
 */
export type RefusalReason =
  | 'no_identity'
  | 'no_tenant_named'
  | 'no_live_membership'
  | 'membership_revoked'
  | 'tenant_deactivated'
  | 'mfa_not_enrolled';

/**
 * Only two of the five refusals write an audit entry. A deactivated tenant does not:
 * writing to its log on every stray request would make its own audit volume a
 * denial-of-service surface (contracts/tenant-context.md).
 */
export const REFUSALS_THAT_AUDIT: ReadonlySet<RefusalReason> = new Set<RefusalReason>([
  'no_live_membership',
  'membership_revoked',
]);
