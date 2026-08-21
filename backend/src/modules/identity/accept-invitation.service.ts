/**
 * US3 — calls `accept_invitation()` (backend/drizzle/0015, research.md D1) and
 * translates its discriminated result. No tenant or identity context is opened
 * here: the function is atomic and self-contained, and the caller may not have
 * an identity yet at all.
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { appDb } from '../../common/db/client';
import { hashInvitationToken } from '../invitation/token';
import { InvitationInvalid } from '../../common/http/errors';

const MAX_FAILED_ATTEMPTS = Number(process.env.INVITATION_MAX_FAILED_ATTEMPTS ?? '10');

export interface AcceptInvitationResult {
  readonly identityId: string;
  readonly membershipId: string;
  readonly tenantId: string;
}

@Injectable()
export class AcceptInvitationService {
  async accept(rawReference: string, subject: string, email: string): Promise<AcceptInvitationResult> {
    const referenceHash = hashInvitationToken(rawReference);

    const result = await appDb().execute<{
      outcome: 'accepted' | 'refused';
      identity_id: string | null;
      membership_id: string | null;
      tenant_id: string | null;
    }>(sql`
      SELECT * FROM accept_invitation(${referenceHash}, ${subject}, ${email}, ${MAX_FAILED_ATTEMPTS})
    `);

    const row = result.rows[0];

    // Every refusal cause the function can reach collapses to this one
    // exception (FR-022, FR-034) — there is nothing here for the controller to
    // branch on, which is what makes the six causes observably identical.
    if (!row || row.outcome !== 'accepted' || !row.identity_id || !row.membership_id || !row.tenant_id) {
      throw new InvitationInvalid();
    }

    return {
      identityId: row.identity_id,
      membershipId: row.membership_id,
      tenantId: row.tenant_id,
    };
  }
}
