/**
 * T022 — explicit sign-out. FR-003 to FR-006, research.md D5.
 *
 * `POST /auth/sign-out` is `@AuthSurface()` (see `sign-out.controller.ts`), so this
 * resolves its own presented token rather than reading anything `SessionGuard`
 * would have populated — the same reason `sign-in`/`refresh` do their own
 * body-token handling despite being on the same surface.
 *
 * WHY THE LOOKUP IS A RAW QUERY BY `access_digest`, NOT `resolveSession()`.
 * `resolveSession()` (and the `resolve_session()` function it wraps) filters on
 * `revoked_at IS NULL AND expires_at > now()` — "live only" by design (D2). Idempotent
 * retry (FR-005) requires the SAME presented token, already revoked by a first call,
 * to succeed again on a second — which a "live only" lookup could never find a
 * second time. So this looks the row up directly, tolerant of any state, and lets
 * `sign_out()`'s own `WHERE revoked_at IS NULL` guards make the actual revocation
 * idempotent.
 *
 * THE AUDIT ENTRY IS WRITTEN ONLY ON THE TRANSITION FROM LIVE TO REVOKED — checked
 * BEFORE calling `sign_out()`, not after (mirrors D2's own "check before write"
 * discipline for `touch_session()`). A second call against an already-dead session
 * writes no additional entry (FR-006/SC-008, User Story 1 scenario 5).
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { withAuthTransaction, type AuthTx } from '../../common/auth/auth-db';
import { digestToken, signOut as revokeFamily } from '../../common/auth/session.port';

export interface SignOutResult {
  readonly signedOut: true;
}

interface SessionRow extends Record<string, unknown> {
  id: string;
  identity_id: string;
  revoked_at: unknown;
}

@Injectable()
export class SignOutService {
  async signOut(accessToken: string): Promise<SignOutResult> {
    await withAuthTransaction(async (tx) => {
      const digest = digestToken(accessToken);
      const found = await tx.execute<SessionRow>(
        sql`SELECT id, identity_id, revoked_at FROM session WHERE access_digest = ${digest}`,
      );
      const row = found.rows[0];
      if (!row) return; // Unknown token: nothing to revoke, nothing to disclose (FR-005).

      const wasLive = row.revoked_at == null;
      await revokeFamily(tx, row.id);
      if (wasLive) await this.audit(tx, row.identity_id, row.id);
    });

    return { signedOut: true };
  }

  /**
   * `tenant_id NULL`, identifying the identity (FR-006) — the same shape
   * `sign-in.service.ts`'s own `audit()` helper already uses for this module.
   */
  private async audit(tx: AuthTx, identityId: string, sessionId: string): Promise<void> {
    await tx.execute(sql`
      INSERT INTO audit_event (tenant_id, action, target_entity, target_id, actor_identity_id, source, metadata)
      VALUES (NULL, 'session.signed_out', 'session', ${sessionId}, ${identityId},
              '{"channel":"interactive"}'::jsonb, '{}'::jsonb)
    `);
  }
}
