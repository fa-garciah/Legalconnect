/**
 * US3 — calls `accept_invitation()` (backend/drizzle/0037, research.md D1/D4) and
 * translates its discriminated result. No tenant or identity context is opened
 * here: the function is atomic and self-contained, and the caller may not have
 * an identity yet at all.
 *
 * 003/T035 changed two things about what this passes in, both forced by
 * self-hosting (research.md D9):
 *
 *  1. THE SUBJECT IS GENERATED HERE, not read from a header. It was the external
 *     IdP's identifier, supplied as `x-subject`; there is no external IdP any
 *     more, so nothing outside this product can name a subject. Generating it
 *     also closes the hole the header left open — a caller who could choose their
 *     own subject could choose one belonging to somebody else and be resolved to
 *     that person's identity by the find-or-create above.
 *  2. THE CREDENTIAL IS ESTABLISHED IN THE SAME TRANSACTION (FR-053). Acceptance
 *     is now the only path into `identity`, and it produces a person who can
 *     actually sign in — which the four-argument version did not.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { appDb } from '../../common/db/client';
import { hashCredential } from '../../common/auth/argon2';
import { hashInvitationToken } from '../invitation/token';
import { InvitationInvalid, ValidationFailed } from '../../common/http/errors';

const MAX_FAILED_ATTEMPTS = Number(process.env.INVITATION_MAX_FAILED_ATTEMPTS ?? '10');

/**
 * The floor, not a policy. A full credential policy belongs with the enrollment
 * screens and is not in this slice's scope; what is in scope is refusing to
 * establish something that is obviously not a credential at all.
 */
const MIN_CREDENTIAL_LENGTH = 12;

export interface AcceptInvitationResult {
  readonly identityId: string;
  readonly membershipId: string;
  readonly tenantId: string;
}

/**
 * An opaque, product-generated subject (D9).
 *
 * DELIBERATELY NOT THE EMAIL, and that is what keeps Recognised Technical Debt
 * item 6 tractable: an identity whose email later changes keeps its subject, and
 * with it its credential, its factor and every membership it holds. Tying the
 * subject to a mutable contact detail would make an email change an identity
 * migration.
 */
function generateSubject(): string {
  return `lc|${randomUUID()}`;
}

@Injectable()
export class AcceptInvitationService {
  async accept(
    rawReference: string,
    email: string,
    credential: string,
  ): Promise<AcceptInvitationResult> {
    if (!credential || credential.length < MIN_CREDENTIAL_LENGTH) {
      throw new ValidationFailed('La contraseña no cumple el mínimo requerido.');
    }

    const referenceHash = hashInvitationToken(rawReference);

    // Hashed BEFORE the call, so no plaintext credential ever reaches a SQL
    // parameter, a parameter log, or pg_stat_statements (research.md D4).
    const digest = await hashCredential(credential);

    const result = await appDb().execute<{
      outcome: 'accepted' | 'refused';
      identity_id: string | null;
      membership_id: string | null;
      tenant_id: string | null;
    }>(sql`
      SELECT * FROM accept_invitation(
        ${referenceHash},
        ${generateSubject()},
        ${email},
        ${digest},
        ${MAX_FAILED_ATTEMPTS}
      )
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
