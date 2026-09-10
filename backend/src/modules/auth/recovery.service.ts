/**
 * T079, T080, T087, T088 — recovery. FR-026 to FR-032, SC-014 to SC-016, SC-033.
 *
 * A person who has lost their authenticator, presenting one of the ten codes
 * they wrote down at enrollment. This is the path the constitution calls the
 * weakest attack surface in the system once MFA is universal — "a phone call
 * cannot be allowed to unlock access to a case file" — which is why it requires
 * a code the person already holds rather than any human decision.
 *
 * THE SHAPE THAT MATTERS: satisfying the challenge with a backup code emits NO
 * SESSION. It emits an enrollment token and nothing else. A person recovering is
 * admitted to RE-ENROLLMENT ONLY, and reaches no tenant-scoped capability until
 * a new factor is confirmed (FR-027, SC-014). Anything looser would make a
 * single written-down code equivalent to the second factor it replaces.
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { withAuthTransaction, type AuthTx } from '../../common/auth/auth-db';
import { verifyAgainstSet, type StoredBackupCode } from './backup-codes';
import { revokeAllSessionsFor } from '../../common/auth/session.port';

function refuse(): never {
  throw new UnauthorizedException({
    error: 'authentication_failed',
    message: 'No fue posible completar el acceso.',
  });
}

const digest = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
const ENROLLMENT_TTL_MS = 10 * 60_000;

export interface RecoveryResult {
  readonly enrollmentToken: string;
  readonly next: 'reenrollment';
  readonly remainingCodes: number;
  /**
   * For the controller to chain `prepareReenrollment()`. NOT part of the wire
   * contract — the controller's declared return type is what shapes the
   * response, and contracts/recovery.md lists three fields.
   */
  readonly identityId: string;
}

function writeStateToken(identityId: string): string {
  return Buffer.from(
    JSON.stringify({ i: identityId, e: Date.now() + ENROLLMENT_TTL_MS, p: 'enrollment' }),
    'utf8',
  ).toString('base64url');
}

@Injectable()
export class RecoveryService {
  /**
   * FR-027. Satisfies the challenge with a backup code and admits the person to
   * re-enrollment — NOT to a session.
   */
  async satisfyWithBackupCode(challengeToken: string, backupCode: string): Promise<RecoveryResult> {
    type Outcome = { kind: 'ok'; result: RecoveryResult } | { kind: 'refused' };

    const outcome = await withAuthTransaction<Outcome>(async (tx) => {
      const peeked = await tx.execute<{ peek_challenge: string | null }>(
        sql`SELECT peek_challenge(${digest(challengeToken)}) AS peek_challenge`,
      );
      const identityId = peeked.rows[0]?.peek_challenge ?? null;
      if (!identityId) return { kind: 'refused' };

      const candidates = await tx.execute<StoredBackupCode>(sql`
        SELECT id, digest FROM backup_code
         WHERE identity_id = ${identityId} AND consumed_at IS NULL
         ORDER BY id
      `);

      // Every unconsumed digest is compared, with no early exit, so the matched
      // code's POSITION in the set is not observable from response time (D11).
      const matchedId = await verifyAgainstSet(backupCode, candidates.rows);

      // FR-021. The attempt counts toward the SAME counter a generated code
      // does, so recovery is not an unthrottled way around the lockout — which
      // it would otherwise be, since a person may present ten different codes.
      const claimed = await tx.execute<{ admitted: boolean; locked: boolean }>(
        sql`SELECT admitted, locked FROM claim_attempt(${identityId}, ${digest(backupCode)}, ${matchedId !== null})`,
      );
      const verdict = claimed.rows[0];

      if (!matchedId || !verdict?.admitted) {
        await this.audit(tx, 'challenge.failed', identityId);
        if (verdict?.locked) await this.audit(tx, 'account.locked', identityId);
        return { kind: 'refused' };
      }

      // Consumption under FOR UPDATE: two recoveries presenting the same LAST
      // unconsumed code yield exactly one success and one consumption.
      const consumed = await tx.execute<{ consume_backup_code: boolean }>(
        sql`SELECT consume_backup_code(${identityId}, ${matchedId}) AS consume_backup_code`,
      );
      if (!consumed.rows[0]?.consume_backup_code) return { kind: 'refused' };

      await this.audit(tx, 'backup_code.consumed', identityId);

      // The challenge is spent too — this code bought exactly one recovery.
      await tx.execute(sql`SELECT consume_challenge(${digest(challengeToken)})`);

      const remaining = await tx.execute<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM backup_code
         WHERE identity_id = ${identityId} AND consumed_at IS NULL
      `);
      const remainingCodes = remaining.rows[0]?.n ?? 0;

      // FR-030. Exhaustion is its own event, distinct from consumption: it is
      // the moment a person's recovery capacity reached zero, and it should be
      // legible in the trail without counting consumptions.
      if (remainingCodes === 0) await this.audit(tx, 'backup_codes.exhausted', identityId);

      return {
        kind: 'ok',
        result: {
          // NO SESSION. Only the token that reaches re-enrollment (FR-027).
          enrollmentToken: writeStateToken(identityId),
          next: 'reenrollment',
          // Disclosed only AFTER success (FR-028): telling a failed attempt how
          // many codes remain would meter an attacker's progress for them.
          remainingCodes,
          identityId,
        },
      };
    });

    if (outcome.kind === 'refused') refuse();
    return outcome.result;
  }

  /**
   * FR-032. Clears the previous factor and its entire code set so the
   * enrollment mechanism can run again.
   *
   * DELIBERATELY NOT A SECOND ENROLLMENT PATH. There is ONE way to enroll a
   * factor in this product, and recovery walks through it: this method resets
   * state and hands off to `EnrollmentService`, which the controller calls next.
   * Duplicating the enrollment logic here would be a second place for the
   * confirmed_at / mfa_enrolled_at invariant to drift.
   */
  async prepareReenrollment(identityId: string): Promise<void> {
    await withAuthTransaction(async (tx) => {
      // The previous factor no longer satisfies a challenge (SC-015).
      await tx.execute(sql`
        UPDATE identity_factor
           SET confirmed_at = NULL,
               failed_attempt_count = 0,
               locked_until = NULL,
               recent_code_digests = '[]'::jsonb
         WHERE identity_id = ${identityId}
      `);
      await tx.execute(sql`UPDATE identity SET mfa_enrolled_at = NULL WHERE id = ${identityId}`);

      // FR-028. Re-issuance REPLACES the set rather than topping it up, so the
      // codes printed before a recovery stop working the moment it completes.
      await tx.execute(sql`DELETE FROM backup_code WHERE identity_id = ${identityId}`);

      // Every session dies with the factor. A person recovering because their
      // phone was stolen should not leave the thief's session alive.
      await revokeAllSessionsFor(tx, identityId);

      await this.audit(tx, 'factor.replaced', identityId);
      await this.audit(tx, 'backup_codes.reissued', identityId);
    });
  }

  private async audit(tx: AuthTx, action: string, identityId: string): Promise<void> {
    await tx.execute(sql`
      INSERT INTO audit_event (tenant_id, action, target_entity, target_id, actor_identity_id, source, metadata)
      VALUES (NULL, ${action}, ${action.startsWith('backup') ? 'backup_code' : 'identity_factor'},
              ${identityId}, ${identityId}, '{"channel":"interactive"}'::jsonb, '{}'::jsonb)
    `);
  }
}
