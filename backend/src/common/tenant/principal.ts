/**
 * What the tenant-context mechanism receives, and what it guarantees.
 *
 * This slice authenticates nothing — it is handed an already-authenticated principal.
 * The seam is specified in contracts/tenant-context.md; these are its types.
 */
export type Archetype = 'SA' | 'MP' | 'AA' | 'PL' | 'CM' | 'BM' | 'IC' | 'CB' | 'EL';

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
}

export interface RequestOrigin {
  readonly channel: Channel;
  readonly clientClass?: string;
  readonly networkOrigin?: string;
}

/** Why an activation was refused. Distinguished because they audit differently. */
export type RefusalReason =
  | 'no_identity'
  | 'no_tenant_named'
  | 'no_live_membership'
  | 'membership_revoked'
  | 'tenant_deactivated';

/**
 * Only two of the five refusals write an audit entry. A deactivated tenant does not:
 * writing to its log on every stray request would make its own audit volume a
 * denial-of-service surface (contracts/tenant-context.md).
 */
export const REFUSALS_THAT_AUDIT: ReadonlySet<RefusalReason> = new Set<RefusalReason>([
  'no_live_membership',
  'membership_revoked',
]);
