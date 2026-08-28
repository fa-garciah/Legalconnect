/**
 * T052a — 006/FR-012a. The cascade that keeps a case team truthful when someone leaves
 * the firm.
 *
 * **The gap this closes.** 006's spec said only that a revoked member's *request* is
 * refused, at membership resolution, before scope is consulted (US3 scenario 7). It said
 * nothing about what the case's team read returns. Left alone, the team list — which shows
 * live assignments, meaning `unassigned_at IS NULL` — would keep listing someone who no
 * longer works at the firm, as `lead`, indefinitely. A partner reading the file would see
 * a name that is no longer anyone's. The clarification session of 2026-08-27 closed it.
 *
 * **Why here and not a read-time join.** Filtering revoked members out when the team is
 * read would answer correctly too, but the `assigned` resolver would need the same join to
 * stay consistent — and that puts a join to `membership` on the authorization hot path,
 * which research.md D1 deliberately kept clear. Closing the rows on the write path costs
 * one indexed statement at revocation time and nothing per request afterwards.
 *
 * **Why the same transaction.** A background job or an event listener would leave the two
 * states divergent for a window, and a window in which a revoked member still reads as
 * assigned is exactly the failure FR-012a exists to prevent.
 *
 * The dependency direction is the one 017 already established: `ProvisionService` (001)
 * imports `seedDefaultPositionCatalog` from the directory module and calls it on its own
 * transaction. Same shape, different lifecycle event.
 */
import { sql } from 'drizzle-orm';
import { currentPrincipal, currentTx } from '../../common/tenant/middleware';
import { appendAuditEntry } from '../../common/audit/append';
import { actorFromPrincipal } from '../../common/audit/actor';
import type { AuditSource } from '../../common/db/schema';

/**
 * Closes every live assignment the membership holds, on the caller's own transaction.
 *
 * An `UPDATE`, not a `DELETE` — there is no DELETE grant on `case_assignment` for any
 * role, and FR-012's "never hard-deleted" is that absent privilege. The historical rows
 * survive exactly as they do after an ordinary unassignment, which is the point: a matter's
 * staffing history is not erased because someone left.
 *
 * No `tenant_id` predicate: `case_assignment_own_tenant` scopes it to the transaction's
 * active tenant, the same way it scopes the resolver's own query.
 *
 * Returns the closed rows so the caller can audit one entry each. A member holding no live
 * assignments returns an empty array and costs one indexed lookup — the common case.
 */
export async function closeAssignmentsForMembership(
  membershipId: string,
  source: AuditSource,
): Promise<readonly { readonly caseId: string }[]> {
  const tx = currentTx();

  const { rows } = await tx.execute<{ case_id: string; [key: string]: unknown }>(sql`
    UPDATE case_assignment
       SET unassigned_at = now()
     WHERE membership_id = ${membershipId}::uuid
       AND unassigned_at IS NULL
    RETURNING case_id
  `);

  const principal = currentPrincipal();
  const actor = actorFromPrincipal(principal);

  // One entry per closed assignment, not one summarising them all. Principle V asks for a
  // record of each mutation, and closing an assignment is one — SC-005 says exactly one
  // entry per mutation, and a single entry carrying an array of case ids would satisfy
  // neither the count nor a later read that filters by `target_id`.
  //
  // The action is `case.team_member_unassigned`, the SAME one a deliberate unassignment
  // writes, deliberately (research.md D8). The event is identical — a person came off a
  // matter — and what distinguishes the two paths is already on the entry: the actor is
  // whoever revoked the membership rather than whoever manages the team, and the
  // `membership.revoked` entry sits beside it in the same transaction naming the cause. A
  // separate action would duplicate what the trail already says.
  //
  // The subject is the MEMBERSHIP, matching both the deliberate unassignment and 017's
  // `directory.position_assigned`; the case is carried in metadata.
  //
  // Written on `tx` — the revocation's own transaction. If any append fails, the
  // revocation rolls back with it, which is the property 001/FR-017 exists for.
  for (const row of rows) {
    await appendAuditEntry(tx, {
      tenantId: principal.tenantId,
      action: 'case.team_member_unassigned',
      targetEntity: 'membership',
      targetId: membershipId,
      ...actor,
      source,
      metadata: { caseId: row.case_id, reason: 'membership_revoked' },
    });
  }

  return rows.map((row) => ({ caseId: row.case_id }));
}
