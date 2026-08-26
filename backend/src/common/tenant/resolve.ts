/**
 * T045 — resolves an authenticated identity plus a NAMED tenant into an active
 * principal, or a refusal.
 *
 * Ordered so the cheapest checks fail first and no database work happens for a
 * malformed request.
 */
import { sql } from 'drizzle-orm';
import { appDb } from '../db/client';
import type { ActivePrincipal, RefusalReason } from './principal';
import type { MembershipPort } from './membership';

export type Resolution =
  | { readonly ok: true; readonly principal: ActivePrincipal }
  | { readonly ok: false; readonly reason: RefusalReason };

export interface ResolveInput {
  readonly identityId?: string | undefined;
  readonly tenantId?: string | undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolvePrincipal(
  input: ResolveInput,
  memberships: MembershipPort,
): Promise<Resolution> {
  if (!input.identityId || !UUID.test(input.identityId)) {
    return { ok: false, reason: 'no_identity' };
  }

  // Never derived from the identity. FR-021 means there may be several tenants, so
  // guessing one would be the bug, not a convenience.
  if (!input.tenantId || !UUID.test(input.tenantId)) {
    return { ok: false, reason: 'no_tenant_named' };
  }

  const membership = await memberships.find(input.identityId, input.tenantId);
  if (!membership) return { ok: false, reason: 'no_live_membership' };
  if (membership.status !== 'live') return { ok: false, reason: 'membership_revoked' };

  const active = await tenantIsActive(input.tenantId);
  if (!active) return { ok: false, reason: 'tenant_deactivated' };

  // FR-026, research.md D5. `undefined` (every pre-002 fixture) is treated as
  // not applicable; only an explicit `null` — the database adapter's answer
  // when enrollment genuinely has not completed — refuses here.
  if (membership.identityMfaEnrolledAt === null) {
    return { ok: false, reason: 'mfa_not_enrolled' };
  }

  return {
    ok: true,
    principal: {
      identityId: input.identityId,
      membershipId: membership.id,
      tenantId: input.tenantId,
      archetype: membership.archetype,
      // 004, research.md D7. `undefined` — every pre-004 fixture and test double — is
      // treated the same as "no plan resolved," matching identityMfaEnrolledAt's
      // pattern immediately above.
      plan:
        membership.planEntitlements !== undefined && membership.planLimits !== undefined
          ? { entitlements: membership.planEntitlements, limits: membership.planLimits }
          : null,
    },
  };
}

/**
 * Reads the tenant's own status.
 *
 * Note how this works: it activates the tenant first, then reads. The tenant table's
 * policy lets a session see exactly its own row, so no cross-tenant reach and no
 * platform role is needed to answer "is this tenant active?" — the isolation
 * mechanism itself supplies the answer, using only the application role.
 *
 * A deactivated tenant, or one whose row is not visible, both return false. Those are
 * treated identically on purpose: distinguishing them would tell a caller whether a
 * tenant id it guessed exists.
 */
async function tenantIsActive(tenantId: string): Promise<boolean> {
  return appDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    const result = await tx.execute<{ status: string }>(
      sql`SELECT status FROM tenant WHERE id = ${tenantId}::uuid`,
    );
    return result.rows[0]?.status === 'active';
  });
}
