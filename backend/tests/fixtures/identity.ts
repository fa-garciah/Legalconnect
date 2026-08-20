/**
 * Identity and membership fixtures standing in for slice 002.
 *
 * This slice builds no identity tables — `spec.md` puts identity out of scope. But
 * FR-021 decided their shape, and this slice's tenant-context mechanism depends on
 * that shape: it receives an explicit tenant and must verify a live membership, rather
 * than deriving a single tenant from the identity. These fixtures are written against
 * the final shape so slice 002 plugs in without changing the contract.
 *
 * The dual-membership identity is not decoration. Without it SC-014 cannot be
 * exercised at all, and that is the check that pays for choosing the more capable
 * identity model.
 */
export type Archetype = 'SA' | 'MP' | 'AA' | 'PL' | 'CM' | 'BM' | 'IC' | 'CB' | 'EL';

export interface Identity {
  readonly id: string;
  /** Subject identifier from the external IdP. Holds no tenant. */
  readonly subject: string;
}

export interface Membership {
  readonly id: string;
  readonly identityId: string;
  readonly tenantId: string;
  /** FR-024: the archetype belongs to the membership, not the identity. */
  readonly archetype: Archetype;
  readonly status: 'live' | 'revoked';
}

export const IDENTITY_SINGLE: Identity = {
  id: '11111111-1111-4111-8111-111111111111',
  subject: 'idp|single-tenant-user',
};

/** Belongs to BOTH seeded tenants. The reason FR-023 is testable. */
export const IDENTITY_DUAL: Identity = {
  id: '22222222-2222-4222-8222-222222222222',
  subject: 'idp|dual-tenant-counsel',
};

export const IDENTITY_OUTSIDER: Identity = {
  id: '33333333-3333-4333-8333-333333333333',
  subject: 'idp|no-membership',
};

export function membership(
  overrides: Partial<Membership> & Pick<Membership, 'identityId' | 'tenantId'>,
): Membership {
  return {
    id: `mm-${overrides.identityId.slice(0, 8)}-${overrides.tenantId.slice(0, 8)}`,
    archetype: 'SA',
    status: 'live',
    ...overrides,
  };
}

/** Builds the membership set the isolation suite expects, given the seeded tenants. */
export function membershipsFor(tenantA: string, tenantB: string): readonly Membership[] {
  return [
    membership({ identityId: IDENTITY_SINGLE.id, tenantId: tenantA, archetype: 'SA' }),
    membership({ identityId: IDENTITY_DUAL.id, tenantId: tenantA, archetype: 'MP' }),
    // Same person, different tenant, DIFFERENT archetype — FR-024.
    membership({ identityId: IDENTITY_DUAL.id, tenantId: tenantB, archetype: 'IC' }),
    // IDENTITY_OUTSIDER deliberately has none.
  ];
}
