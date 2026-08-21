/**
 * The seam between slice 001 and slice 002.
 *
 * Slice 001 built the tenant-context mechanism against this contract but supplied
 * identity and membership through `InMemoryMembershipPort`. This slice adds the
 * database-backed adapter behind the SAME port — nothing above this interface
 * changes. `InMemoryMembershipPort` is not retired: 001's fixture-driven tests
 * still construct their own isolated Nest modules with it directly (see
 * tests/helpers/app.ts, tenant-app.ts), independent of the real wiring in
 * `app.module.ts`, which now binds `DbMembershipPort` instead.
 */
import { sql } from 'drizzle-orm';
import type { Archetype } from './principal';
import { appDb } from '../db/client';

export const MEMBERSHIP_PORT = Symbol('MEMBERSHIP_PORT');

export interface MembershipRecord {
  readonly id: string;
  readonly identityId: string;
  readonly tenantId: string;
  /** FR-024: the archetype belongs to the membership, not the identity. */
  readonly archetype: Archetype;
  readonly status: 'live' | 'revoked';
  /**
   * FR-026 (slice 002, research.md D5). `null` means the identity's
   * second-factor enrollment has not completed and access must be refused.
   * `undefined` — the shape every pre-002 fixture and test double already
   * carries — is treated as not applicable, so this slice's MFA gate does not
   * retroactively fail a membership nothing ever asked about MFA. Only
   * `DbMembershipPort` ever returns `null`.
   */
  readonly identityMfaEnrolledAt?: string | null;
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

/**
 * The database-backed adapter (research.md D5). Because the lookup itself is
 * what decides whether a tenant may be activated, it cannot wait for that
 * activation to happen first — so it opens its own short-lived transaction and
 * sets BOTH `app.tenant_id` and `app.identity_id` to the CLAIMED values before
 * querying. That is safe, not a bypass: `membership`'s RLS policies only ever
 * reveal a row for the exact (identity, tenant) pair named in the setting, so
 * this reveals nothing beyond what `find` is already trusted to determine —
 * there is no enumeration surface here, only "does this exact pair have a row."
 * The same technique 001's `tenantIsActive` already uses for the tenant table.
 */
export class DbMembershipPort implements MembershipPort {
  async find(identityId: string, tenantId: string): Promise<MembershipRecord | null> {
    return appDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
      await tx.execute(sql`SELECT set_config('app.identity_id', ${identityId}, true)`);

      const result = await tx.execute<{
        id: string;
        identity_id: string;
        tenant_id: string;
        archetype: Archetype;
        status: 'live' | 'revoked';
        mfa_enrolled_at: string | null;
      }>(sql`
        SELECT m.id, m.identity_id, m.tenant_id, m.archetype, m.status, i.mfa_enrolled_at
          FROM membership m
          JOIN identity i ON i.id = m.identity_id
         WHERE m.identity_id = ${identityId}::uuid
           AND m.tenant_id = ${tenantId}::uuid
      `);

      const row = result.rows[0];
      if (!row) return null;

      return {
        id: row.id,
        identityId: row.identity_id,
        tenantId: row.tenant_id,
        archetype: row.archetype,
        status: row.status,
        identityMfaEnrolledAt: row.mfa_enrolled_at,
      };
    });
  }
}
