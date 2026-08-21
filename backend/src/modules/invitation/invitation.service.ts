/**
 * US2 — issue, revoke, list. All three are ordinary tenant-scoped operations:
 * RLS on `invitation` restricts everything here to the active tenant, the
 * same way every other 001-style table does. No special mechanism is needed
 * for this half of the slice — only `accept_invitation()` (US3) is.
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { currentTx, currentPrincipal } from '../../common/tenant/middleware';
import { NotAuthorized, RateLimited, ResourceNotFound } from '../../common/http/errors';
import { generateInvitationToken } from './token';
import { isBroaderThan } from './archetype-rank';
import { normaliseArchetype, normaliseEmail } from './validate';
import type { Archetype } from '../../common/tenant/principal';

const ISSUANCE_RATE_PER_HOUR = Number(process.env.INVITATION_ISSUANCE_RATE_PER_HOUR ?? '50');

export interface InvitationRow {
  readonly id: string;
  readonly tenantId: string;
  readonly targetArchetype: Archetype;
  readonly status: 'pending' | 'accepted' | 'revoked';
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

interface RawRow {
  id: string;
  tenant_id: string;
  target_archetype: Archetype;
  status: 'pending' | 'accepted' | 'revoked';
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  /** Drizzle's `execute<T>` constrains T to Record<string, unknown>. */
  [key: string]: unknown;
}

const present = (row: RawRow): InvitationRow => ({
  id: row.id,
  tenantId: row.tenant_id,
  targetArchetype: row.target_archetype,
  status: row.status,
  issuedAt: row.issued_at,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
});

export interface IssuedInvitation {
  readonly row: InvitationRow;
  /** Never returned to the caller (contracts/tenant-invitations.md) — only used to compose the outgoing message. */
  readonly rawReferenceToken: string;
}

@Injectable()
export class InvitationService {
  /**
   * Only SA/MP hold the invite capability at all (FR-020) — enforced by
   * `@RequireArchetypes('SA', 'MP')` on the route, not repeated here.
   */
  async issue(input: { readonly email?: unknown; readonly targetArchetype?: unknown }): Promise<IssuedInvitation> {
    const email = normaliseEmail(input.email);
    const targetArchetype = normaliseArchetype(input.targetArchetype);
    const principal = currentPrincipal();

    // FR-021: nobody may grant an archetype broader than their own.
    if (isBroaderThan(targetArchetype, principal.archetype)) {
      throw new NotAuthorized();
    }

    await this.assertUnderIssuanceRate(principal.tenantId);

    const token = generateInvitationToken();

    const { rows } = await currentTx().execute<RawRow>(sql`
      INSERT INTO invitation (tenant_id, target_archetype, invited_email, reference_hash, issued_by_membership_id, seeded)
      VALUES (${principal.tenantId}::uuid, ${targetArchetype}, ${email}, ${token.hash}, ${principal.membershipId}::uuid, false)
      RETURNING id, tenant_id, target_archetype, status, issued_at, expires_at, revoked_at
    `);

    const row = rows[0];
    if (!row) throw new Error('invitation insert returned no row');

    return { row: present(row), rawReferenceToken: token.raw };
  }

  async revoke(id: string): Promise<InvitationRow> {
    const { rows } = await currentTx().execute<RawRow>(sql`
      UPDATE invitation
         SET status = 'revoked', revoked_at = now()
       WHERE id = ${id}::uuid AND status = 'pending'
       RETURNING id, tenant_id, target_archetype, status, issued_at, expires_at, revoked_at
    `);

    // FR-022, extended to this endpoint: an already-accepted/revoked invitation
    // and one that never existed answer the same generic not-found.
    const row = rows[0];
    if (!row) throw new ResourceNotFound();
    return present(row);
  }

  async listPending(): Promise<readonly InvitationRow[]> {
    const { rows } = await currentTx().execute<RawRow>(sql`
      SELECT id, tenant_id, target_archetype, status, issued_at, expires_at, revoked_at
        FROM invitation
       WHERE status = 'pending'
       ORDER BY issued_at DESC
    `);
    return rows.map(present);
  }

  /** research.md D8 — coarse, tenant-level anti-abuse cap. */
  private async assertUnderIssuanceRate(tenantId: string): Promise<void> {
    const { rows } = await currentTx().execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM invitation
       WHERE tenant_id = ${tenantId}::uuid AND issued_at > now() - interval '1 hour'
    `);
    if (Number(rows[0]?.n ?? '0') >= ISSUANCE_RATE_PER_HOUR) {
      throw new RateLimited();
    }
  }
}
