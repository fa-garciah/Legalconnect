/**
 * FR-035 / research.md D6 — the one PO capability, and it is self-extinguishing.
 * Runs under the platform role, whose reach this slice extends by exactly the
 * two narrow grants D6 names: a read-only existence-check on `membership`, and
 * an insert restricted to `seeded = true` rows on `invitation`.
 */
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { currentPlatformTx } from '../../common/db/platform-context';
import { AlreadyDeactivated, ResourceNotFound, TenantAlreadyHasMembers } from '../../common/http/errors';
import { generateInvitationToken } from '../invitation/token';
import { normaliseEmail } from '../invitation/validate';

export interface SeedInvitationRow {
  readonly id: string;
  readonly tenantId: string;
  readonly targetArchetype: 'SA';
  readonly seeded: true;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

@Injectable()
export class SeedAdministratorService {
  async seed(tenantId: string, input: { readonly email?: unknown }): Promise<SeedInvitationRow> {
    const email = normaliseEmail(input.email);
    const tx = currentPlatformTx();

    const tenant = await tx.execute<{ status: 'active' | 'deactivated' }>(sql`
      SELECT status FROM tenant WHERE id = ${tenantId}::uuid
    `);
    const status = tenant.rows[0]?.status;
    if (!status) throw new ResourceNotFound();
    if (status === 'deactivated') throw new AlreadyDeactivated();

    // The existence-check (research.md D6): the platform role can see WHETHER
    // a live membership exists, never who holds it.
    const existing = await tx.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM membership WHERE tenant_id = ${tenantId}::uuid AND status = 'live'
    `);
    if (Number(existing.rows[0]?.n ?? '0') > 0) {
      throw new TenantAlreadyHasMembers();
    }

    const token = generateInvitationToken();

    // No RETURNING (the same fix research.md D1 applies to accept_invitation,
    // and 001/D8 applied to its own definer function): lc_platform holds
    // INSERT only on invitation, and INSERT ... RETURNING requires SELECT
    // too. id/issued_at/expires_at are computed here instead, deterministically
    // matching the row the INSERT will actually write.
    const id = randomUUID();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    await tx.execute(sql`
      INSERT INTO invitation (id, tenant_id, target_archetype, invited_email, reference_hash, issued_by_membership_id, seeded, issued_at, expires_at)
      VALUES (${id}::uuid, ${tenantId}::uuid, 'SA', ${email}, ${token.hash}, NULL, true, ${issuedAt.toISOString()}::timestamptz, ${expiresAt.toISOString()}::timestamptz)
    `);

    return {
      id,
      tenantId,
      targetArchetype: 'SA',
      seeded: true,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }
}
