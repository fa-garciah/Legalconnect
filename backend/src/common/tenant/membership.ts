/**
 * The seam between slice 001 and slice 002.
 *
 * This slice builds no identity or membership tables — `spec.md` puts identity out of
 * scope. But FR-021 decided their shape, and the tenant-context mechanism depends on
 * it: an identity may hold several memberships, so there is no single tenant to derive
 * and one must be named explicitly and then verified.
 *
 * Slice 002 replaces the in-memory adapter with a database-backed one behind this same
 * port. Nothing above this interface changes when it does.
 */
import type { Archetype } from './principal';

export const MEMBERSHIP_PORT = Symbol('MEMBERSHIP_PORT');

export interface MembershipRecord {
  readonly id: string;
  readonly identityId: string;
  readonly tenantId: string;
  /** FR-024: the archetype belongs to the membership, not the identity. */
  readonly archetype: Archetype;
  readonly status: 'live' | 'revoked';
}

export interface MembershipPort {
  /**
   * Looks up the membership joining one identity to one tenant.
   *
   * Deliberately takes both and returns at most one. There is no
   * `findAllForIdentity` on this port, because nothing in a tenant-scoped request has
   * a legitimate reason to enumerate an identity's other memberships — and an
   * interface that cannot express the leak is worth more than a rule asking callers
   * not to (FR-023).
   */
  find(identityId: string, tenantId: string): Promise<MembershipRecord | null>;
}

export class InMemoryMembershipPort implements MembershipPort {
  private readonly records: readonly MembershipRecord[];

  constructor(records: readonly MembershipRecord[]) {
    this.records = records;
  }

  find(identityId: string, tenantId: string): Promise<MembershipRecord | null> {
    const found = this.records.find(
      (r) => r.identityId === identityId && r.tenantId === tenantId,
    );
    return Promise.resolve(found ?? null);
  }
}
