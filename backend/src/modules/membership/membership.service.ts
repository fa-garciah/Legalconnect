/**
 * FR-009, FR-012 — revoke a membership, or change its archetype. Both are
 * ordinary tenant-scoped `UPDATE`s; RLS restricts either to the active
 * tenant's own rows (`membership_own_tenant_update`, backend/drizzle/0013).
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';
import { AlreadyRevoked, LastAdministratorProtected, ResourceNotFound } from '../../common/http/errors';
import { normaliseArchetype } from '../invitation/validate';
import { closeAssignmentsForMembership } from '../case-core/close-assignments';
import type { AuditSource } from '../../common/db/schema';
import type { Archetype } from '../../common/tenant/principal';

/**
 * `backend/drizzle/0019_membership_retain_one_sa.sql` — the last-SA invariant. Match
 * on the `code` property, never the message, so a reworded exception does not break
 * the mapping (004, T052).
 */
const LAST_SA_PROTECTED_SQLSTATE = '23001';

function sqlstateOf(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  const withCode = error as { code?: unknown; cause?: unknown };
  // Drizzle wraps the driver's error in a DrizzleQueryError; the SQLSTATE pg set
  // lives on `.cause.code`, not on the wrapper itself.
  return withCode.code ?? sqlstateOf(withCode.cause);
}

function isLastSaProtectedError(error: unknown): boolean {
  return sqlstateOf(error) === LAST_SA_PROTECTED_SQLSTATE;
}

export interface RevocationResult {
  readonly row: MembershipRow;
  /** 006/FR-012a — the cases this revocation took the member off, for the audit trail. */
  readonly closedAssignmentCaseIds: readonly string[];
}

export interface MembershipRow {
  readonly id: string;
  readonly tenantId: string;
  readonly identityId: string;
  readonly archetype: Archetype;
  readonly status: 'live' | 'revoked';
}

interface RawRow {
  id: string;
  tenant_id: string;
  identity_id: string;
  archetype: Archetype;
  status: 'live' | 'revoked';
  /** Drizzle's `execute<T>` constrains T to Record<string, unknown>. */
  [key: string]: unknown;
}

const present = (row: RawRow): MembershipRow => ({
  id: row.id,
  tenantId: row.tenant_id,
  identityId: row.identity_id,
  archetype: row.archetype,
  status: row.status,
});

@Injectable()
export class MembershipService {
  /**
   * 006/FR-012a — revocation also closes the membership's live case assignments, on THIS
   * transaction, so the two cannot come apart.
   *
   * Without it a revoked member keeps appearing on every case team they were on, since
   * that read shows live assignments and nothing else knew to end them. The alternative —
   * joining `membership` at read time — would put that join on the `assigned` resolver's
   * hot path too, which 006/research.md D1 deliberately kept clear.
   *
   * The direction of the import is the one 017 established: 001's `ProvisionService`
   * already calls into the directory module the same way, on its own transaction.
   */
  async revoke(id: string, source: AuditSource): Promise<RevocationResult> {
    const existing = await currentTx().execute<{ status: 'live' | 'revoked' }>(sql`
      SELECT status FROM membership WHERE id = ${id}::uuid
    `);
    if (!existing.rows[0]) throw new ResourceNotFound();
    if (existing.rows[0].status === 'revoked') throw new AlreadyRevoked();

    let rows: readonly RawRow[];
    try {
      ({ rows } = await currentTx().execute<RawRow>(sql`
        UPDATE membership
           SET status = 'revoked', revoked_at = now()
         WHERE id = ${id}::uuid AND status = 'live'
         RETURNING id, tenant_id, identity_id, archetype, status
      `));
    } catch (error) {
      if (isLastSaProtectedError(error)) throw new LastAdministratorProtected();
      throw error;
    }
    const row = rows[0];
    if (!row) throw new ResourceNotFound();

    // After the revocation succeeded, and inside the same transaction: if the UPDATE above
    // had thrown (the last-SA invariant), nothing here runs and no assignment is closed
    // for a membership that is still live.
    const closed = await closeAssignmentsForMembership(row.id, source);

    return { row: present(row), closedAssignmentCaseIds: closed.map((c) => c.caseId) };
  }

  async changeArchetype(
    id: string,
    rawArchetype: unknown,
  ): Promise<{ readonly row: MembershipRow; readonly previousArchetype: Archetype }> {
    const archetype = normaliseArchetype(rawArchetype);

    const existing = await currentTx().execute<{ archetype: Archetype }>(sql`
      SELECT archetype FROM membership WHERE id = ${id}::uuid AND status = 'live'
    `);
    const previous = existing.rows[0];
    if (!previous) throw new ResourceNotFound();

    let rows: readonly RawRow[];
    try {
      ({ rows } = await currentTx().execute<RawRow>(sql`
        UPDATE membership
           SET archetype = ${archetype}
         WHERE id = ${id}::uuid AND status = 'live'
         RETURNING id, tenant_id, identity_id, archetype, status
      `));
    } catch (error) {
      if (isLastSaProtectedError(error)) throw new LastAdministratorProtected();
      throw error;
    }
    const row = rows[0];
    if (!row) throw new ResourceNotFound();
    return { row: present(row), previousArchetype: previous.archetype };
  }
}
