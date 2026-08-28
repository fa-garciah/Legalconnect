/**
 * T050 — the case team's storage seam. 006/FR-009 to FR-012a.
 *
 * There is no `delete` method and no DELETE grant behind one. Unassignment is an `UPDATE`
 * setting `unassigned_at`; FR-012's "never hard-deleted" is the absent privilege. The
 * `DELETE` verb on the wire (contracts/case-api.md §6) describes the caller's intent, not
 * the storage.
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';

export type CaseRoleOnCase = 'lead' | 'collaborator' | 'support';

export interface AssignmentRow {
  readonly id: string;
  readonly caseId: string;
  readonly membershipId: string;
  readonly roleOnCase: CaseRoleOnCase;
  readonly assignedAt: string;
  readonly unassignedAt: string | null;
}

export interface TeamMemberRow {
  readonly membershipId: string;
  readonly roleOnCase: CaseRoleOnCase;
  readonly assignedAt: string;
}

interface Raw {
  id: string;
  case_id: string;
  membership_id: string;
  role_on_case: CaseRoleOnCase;
  assigned_at: string;
  unassigned_at: string | null;
  [key: string]: unknown;
}

const present = (row: Raw): AssignmentRow => ({
  id: row.id,
  caseId: row.case_id,
  membershipId: row.membership_id,
  roleOnCase: row.role_on_case,
  assignedAt: row.assigned_at,
  unassignedAt: row.unassigned_at,
});

const COLUMNS = sql`id, case_id, membership_id, role_on_case,
  assigned_at::text AS assigned_at, unassigned_at::text AS unassigned_at`;

@Injectable()
export class CaseAssignmentRepository {
  /**
   * The case's current team. Live rows only — history persists in the table and no route
   * in this slice exposes it.
   *
   * No join to `membership` to exclude revoked people: FR-012a closes their assignments in
   * the revocation's own transaction, so a revoked member holds no live row. That is what
   * keeps this read, and the `assigned` resolver, join-free (research.md D1).
   */
  async listLiveByCase(caseId: string): Promise<readonly TeamMemberRow[]> {
    const { rows } = await currentTx().execute<Raw>(sql`
      SELECT ${COLUMNS} FROM case_assignment
       WHERE case_id = ${caseId}::uuid AND unassigned_at IS NULL
       ORDER BY assigned_at, id
    `);
    return rows.map((row) => ({
      membershipId: row.membership_id,
      roleOnCase: row.role_on_case,
      assignedAt: row.assigned_at,
    }));
  }

  async findLive(caseId: string, membershipId: string): Promise<AssignmentRow | null> {
    const { rows } = await currentTx().execute<Raw>(sql`
      SELECT ${COLUMNS} FROM case_assignment
       WHERE case_id = ${caseId}::uuid
         AND membership_id = ${membershipId}::uuid
         AND unassigned_at IS NULL
    `);
    const row = rows[0];
    return row ? present(row) : null;
  }

  /**
   * `tenant_id` is written from the session setting, never from the request — the same
   * discipline every insert in this codebase follows, and the reason the denormalised
   * column cannot drift from the case's own tenant.
   *
   * A duplicate live pair raises the `case_assignment_live_unique` violation rather than
   * being pre-checked, so two concurrent callers cannot both succeed.
   */
  async insert(
    caseId: string,
    membershipId: string,
    roleOnCase: CaseRoleOnCase,
  ): Promise<AssignmentRow> {
    const { rows } = await currentTx().execute<Raw>(sql`
      INSERT INTO case_assignment (case_id, membership_id, tenant_id, role_on_case)
      VALUES (
        ${caseId}::uuid,
        ${membershipId}::uuid,
        NULLIF(current_setting('app.tenant_id', true), '')::uuid,
        ${roleOnCase}::case_role
      )
      RETURNING ${COLUMNS}
    `);
    const row = rows[0];
    if (!row) throw new Error('the case assignment insert returned no row');
    return present(row);
  }

  /**
   * `unassigned_at IS NULL` in the predicate makes this idempotent-safe at the data layer:
   * a concurrent second unassignment updates nothing and returns no row, which the service
   * reads as the same refusal its pre-check would have raised.
   */
  async unassign(caseId: string, membershipId: string): Promise<AssignmentRow | null> {
    const { rows } = await currentTx().execute<Raw>(sql`
      UPDATE case_assignment
         SET unassigned_at = now()
       WHERE case_id = ${caseId}::uuid
         AND membership_id = ${membershipId}::uuid
         AND unassigned_at IS NULL
      RETURNING ${COLUMNS}
    `);
    const row = rows[0];
    return row ? present(row) : null;
  }

  /**
   * FR-010 — assignment references a MEMBERSHIP, and only a live one of this tenant.
   * Returns `null` for revoked, foreign and absent alike; the caller maps all three to one
   * refusal so none can be told from another.
   */
  async findLiveMembership(membershipId: string): Promise<{ readonly id: string } | null> {
    const { rows } = await currentTx().execute<{ id: string; [key: string]: unknown }>(sql`
      SELECT id FROM membership WHERE id = ${membershipId}::uuid AND status = 'live'
    `);
    const row = rows[0];
    return row ? { id: row.id } : null;
  }
}
