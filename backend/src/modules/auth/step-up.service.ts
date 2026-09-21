/**
 * T030 — the step-up verification step. FR-018 to FR-022, research.md D6.
 *
 * `POST /auth/step-up` is `@AuthSurface()` (see `step-up.controller.ts`), so this
 * resolves the presented ACCESS token itself, on `lc_auth`'s connection — the same
 * reason `sign-out.service.ts` does its own resolution rather than reading
 * anything `SessionGuard` would have populated.
 *
 * REUSES `sign-in.service.ts`'s EXACT verification pair: `KeyProvider.unwrap()` +
 * `verifyCode()` against the same `identity_factor` row. No new enrollment, no new
 * factor, no duplicated TOTP logic.
 *
 * THE UNIFORM REFUSAL, same posture `sign-in.service.ts` already established: a
 * wrong code, an unresolvable session, and a not-yet-enrolled identity (which
 * should not exist given mandatory MFA, but is not trusted blindly) all reach the
 * same `refuse()` — FR-020's "no disclosure of which specific check failed."
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { withAuthTransaction, type AuthTx } from '../../common/auth/auth-db';
import { resolveKeyProvider } from '../../common/auth/key-provider';
import { verifyCode } from '../../common/auth/totp';
import { digestToken } from '../../common/auth/session.port';
import { STEP_UP_CAPABILITIES, type CapabilityId } from '../../common/authz/capability';
import { ResourceNotFound } from '../../common/http/errors';

/** FR-020, same shape `sign-in.service.ts`'s own `refuse()` uses. */
function refuse(): never {
  throw new UnauthorizedException({
    error: 'authentication_failed',
    message: 'No fue posible completar el acceso.',
  });
}

const digest = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
const opaqueToken = (): string => randomBytes(32).toString('base64url');

/** research.md D6 — long enough for one retry round-trip, deliberately short. */
const ELEVATION_TTL_MINUTES = 2;

export interface StepUpResult {
  readonly stepUpToken: string;
  readonly expiresAt: string;
}

@Injectable()
export class StepUpService {
  async verify(accessToken: string, capability: string, code: string): Promise<StepUpResult> {
    // FR-018: only the five stepUp: true ids are reachable at all — any other
    // value is refused before a code is even checked, the same 404 an undeclared
    // capability already gets elsewhere in the authorization pipeline.
    if (!STEP_UP_CAPABILITIES.has(capability as CapabilityId)) throw new ResourceNotFound();

    type Outcome = { kind: 'ok'; result: StepUpResult } | { kind: 'refused' };

    const outcome = await withAuthTransaction<Outcome>(async (tx) => {
      const sessionDigest = digestToken(accessToken);
      const resolved = await tx.execute<{ identity_id: string }>(
        sql`SELECT identity_id FROM resolve_session(${sessionDigest})`,
      );
      const identityId = resolved.rows[0]?.identity_id;
      // No live session at all: refused the same uniform way — this is not a new
      // refusal class, it collapses into the one FR-020 already governs.
      if (!identityId) return { kind: 'refused' };

      const factor = await tx.execute<{ secret_ciphertext: Buffer; key_reference: string }>(
        sql`SELECT secret_ciphertext, key_reference FROM identity_factor WHERE identity_id = ${identityId}`,
      );
      const stored = factor.rows[0];
      if (!stored) {
        await this.audit(tx, 'stepup.failed', identityId, capability);
        return { kind: 'refused' };
      }

      let codeOk = false;
      try {
        const secret = await resolveKeyProvider().unwrap(
          stored.key_reference,
          Buffer.from(stored.secret_ciphertext),
        );
        codeOk = await verifyCode(secret.toString('utf8'), code, Math.floor(Date.now() / 1000));
      } catch {
        // FR-017's posture, reused verbatim: a key outage fails CLOSED and is
        // indistinguishable from a wrong code to the person.
        codeOk = false;
      }

      if (!codeOk) {
        await this.audit(tx, 'stepup.failed', identityId, capability);
        return { kind: 'refused' };
      }

      const token = opaqueToken();
      const tokenDigest = digest(token);
      const expiresAt = new Date(Date.now() + ELEVATION_TTL_MINUTES * 60_000);

      await tx.execute(sql`
        INSERT INTO step_up_elevation (identity_id, capability, token_digest, expires_at)
        VALUES (${identityId}, ${capability}, ${tokenDigest}, ${expiresAt.toISOString()}::timestamptz)
      `);
      await this.audit(tx, 'stepup.verified', identityId, capability);

      return { kind: 'ok', result: { stepUpToken: token, expiresAt: expiresAt.toISOString() } };
    });

    if (outcome.kind === 'refused') refuse();
    return outcome.result;
  }

  /**
   * `tenant_id NULL`, identifying the identity AND the capability (FR-021) —
   * carried in `metadata`, the same way `case.team_member_assigned` etc. carry
   * their own extra context elsewhere in this codebase.
   */
  private async audit(
    tx: AuthTx,
    action: 'stepup.verified' | 'stepup.failed',
    identityId: string,
    capability: string,
  ): Promise<void> {
    await tx.execute(sql`
      INSERT INTO audit_event (tenant_id, action, target_entity, actor_identity_id, source, metadata)
      VALUES (NULL, ${action}, 'step_up_elevation', ${identityId},
              '{"channel":"interactive"}'::jsonb, ${JSON.stringify({ capability })}::jsonb)
    `);
  }
}
