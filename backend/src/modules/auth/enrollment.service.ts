/**
 * T069, T070, T078 — enrollment. FR-006 to FR-017, FR-023 to FR-031.
 *
 * `begin()` issues THE ONLY RESPONSE IN THIS PRODUCT THAT RETURNS A FACTOR
 * SECRET, exactly once, to the person enrolling, during the exchange that
 * requires it. After that no route returns it — not to its owner, not to an SA,
 * not to the platform operator (FR-015, SC-006). `lc_app` holds no grant on the
 * table at all, so the absence is a data-layer fact rather than a missing route.
 *
 * `confirm()` does five things IN ONE TRANSACTION, and the atomicity is the
 * requirement rather than a convenience: FR-023 says enrollment does not
 * complete without the codes, so there must be no state in which a confirmed
 * factor exists and no codes do. A person left in that state would appear
 * enrolled, be unable to recover, and have no way to tell.
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { withAuthTransaction, type AuthTx } from '../../common/auth/auth-db';
import { resolveKeyProvider } from '../../common/auth/key-provider';
import { enrollmentUri, generateSecret, verifyCode } from '../../common/auth/totp';
import { mintSession } from '../../common/auth/session.port';
import { generateBackupCodeSet, hashBackupCodes, BACKUP_CODE_COUNT } from './backup-codes';

function refuse(): never {
  throw new UnauthorizedException({
    error: 'authentication_failed',
    message: 'No fue posible completar el acceso.',
  });
}


const ISSUER = 'LegalConnect MX';
const ENROLLMENT_TTL_MS = 10 * 60_000;

export interface BeginResult {
  readonly secret: string;
  readonly otpauthUri: string;
  readonly enrollmentToken: string;
}

export interface ConfirmResult {
  readonly backupCodes: readonly string[];
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: string;
}

interface StateToken {
  i: string;
  e: number;
  p: 'enrollment';
}

/**
 * The pending-enrollment token. Self-contained rather than stored, and unlike
 * the challenge token that is safe: replaying it only begins enrollment again,
 * which FR-010 already makes harmless by discarding the prior unconfirmed
 * secret. There is no session to mint twice.
 */
function readStateToken(raw: string): string | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as StateToken;
    if (parsed.p !== 'enrollment' || typeof parsed.i !== 'string') return null;
    if (typeof parsed.e !== 'number' || parsed.e < Date.now()) return null;
    return parsed.i;
  } catch {
    return null;
  }
}

function writeStateToken(identityId: string): string {
  const payload: StateToken = { i: identityId, e: Date.now() + ENROLLMENT_TTL_MS, p: 'enrollment' };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

@Injectable()
export class EnrollmentService {
  /** FR-009. Issues a secret; does NOT complete enrollment. */
  async begin(challengeToken: string): Promise<BeginResult> {
    const identityId = readStateToken(challengeToken);
    if (!identityId) refuse();

    type Outcome = { kind: 'ok'; result: BeginResult } | { kind: 'refused' };

    const outcome = await withAuthTransaction<Outcome>(async (tx) => {
      const existing = await tx.execute<{ confirmed_at: unknown; email: string }>(sql`
        SELECT f.confirmed_at, i.email
          FROM identity i
          LEFT JOIN identity_factor f ON f.identity_id = i.id
         WHERE i.id = ${identityId}
      `);
      const row = existing.rows[0];
      if (!row) return { kind: 'refused' };

      // FR-012. An enrolled identity cannot enroll again; replacing a factor is
      // reached only through recovery, which requires proving a backup code.
      if (row.confirmed_at) return { kind: 'refused' };

      const secret = generateSecret();
      const wrapped = await resolveKeyProvider().wrap(Buffer.from(secret, 'utf8'));

      // FR-010. Beginning again REPLACES any prior unconfirmed secret, rather
      // than leaving two live: a person who started twice should find only their
      // latest QR working, and an abandoned secret should not stay enrollable.
      await tx.execute(sql`
        INSERT INTO identity_factor (identity_id, secret_ciphertext, key_reference)
        VALUES (${identityId}, ${wrapped.ciphertext}, ${wrapped.keyReference})
        ON CONFLICT (identity_id) DO UPDATE
          SET secret_ciphertext = EXCLUDED.secret_ciphertext,
              key_reference     = EXCLUDED.key_reference,
              confirmed_at      = NULL,
              failed_attempt_count = 0,
              locked_until      = NULL,
              recent_code_digests  = '[]'::jsonb
      `);

      await this.audit(tx, 'enrollment.started', identityId);

      return {
        kind: 'ok',
        result: {
          secret,
          otpauthUri: enrollmentUri(secret, row.email, ISSUER),
          enrollmentToken: writeStateToken(identityId),
        },
      };
    });

    if (outcome.kind === 'refused') refuse();
    return outcome.result;
  }

  /**
   * FR-011, FR-023, FR-031. Confirms, sets the shipped interface column, issues
   * exactly ten codes, and emits a session — all in one transaction.
   */
  async confirm(enrollmentToken: string, code: string): Promise<ConfirmResult> {
    const identityId = readStateToken(enrollmentToken);
    if (!identityId) refuse();

    type Outcome = { kind: 'ok'; result: ConfirmResult } | { kind: 'refused' };

    const outcome = await withAuthTransaction<Outcome>(async (tx) => {
      const found = await tx.execute<{
        secret_ciphertext: Buffer;
        key_reference: string;
        confirmed_at: unknown;
      }>(sql`
        SELECT secret_ciphertext, key_reference, confirmed_at
          FROM identity_factor WHERE identity_id = ${identityId}
      `);
      const factor = found.rows[0];
      if (!factor || factor.confirmed_at) return { kind: 'refused' };

      let codeOk = false;
      try {
        const secret = await resolveKeyProvider().unwrap(
          factor.key_reference,
          Buffer.from(factor.secret_ciphertext),
        );
        codeOk = await verifyCode(secret.toString('utf8'), code, Math.floor(Date.now() / 1000));
      } catch {
        // FR-017 again: an unavailable key fails closed and looks like a wrong
        // code. The identity stays unenrolled and the attempt is recorded.
        codeOk = false;
      }

      if (!codeOk) {
        await this.audit(tx, 'enrollment.failed', identityId);
        return { kind: 'refused' };
      }

      // FR-011. `confirmed_at` is the FACT; `identity.mfa_enrolled_at` is
      // 002/FR-026's already-shipped interface to it. THE TWO MUST NOT DIVERGE,
      // which is why they are written together and not by two callers.
      await tx.execute(
        sql`UPDATE identity_factor SET confirmed_at = now() WHERE identity_id = ${identityId}`,
      );
      await tx.execute(
        sql`UPDATE identity SET mfa_enrolled_at = now() WHERE id = ${identityId}`,
      );

      // FR-023. In the SAME transaction: if this throws, the confirmation above
      // is rolled back with it and the identity stays unenrolled. There is no
      // state in which a confirmed factor exists and no codes do.
      const codes = generateBackupCodeSet(BACKUP_CODE_COUNT);
      const digests = await hashBackupCodes(codes);
      // One set_id for the whole set, so re-issuance can replace it wholesale
      // rather than topping it up (FR-028).
      const setId = randomUUID();
      for (const stored of digests) {
        await tx.execute(sql`
          INSERT INTO backup_code (identity_id, set_id, digest)
          VALUES (${identityId}, ${setId}, ${stored})
        `);
      }

      await this.audit(tx, 'enrollment.completed', identityId);
      await this.audit(tx, 'backup_codes.issued', identityId);

      const session = await mintSession(tx, identityId, {});

      return {
        kind: 'ok',
        result: {
          // Returned exactly once. No route returns them again, for anyone.
          backupCodes: codes,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresAt: session.expiresAt.toISOString(),
        },
      };
    });

    if (outcome.kind === 'refused') refuse();
    return outcome.result;
  }

  /** `tenant_id NULL`, identity by reference, and NEVER the secret (FR-014). */
  private async audit(tx: AuthTx, action: string, identityId: string): Promise<void> {
    await tx.execute(sql`
      INSERT INTO audit_event (tenant_id, action, target_entity, target_id, actor_identity_id, source, metadata)
      VALUES (NULL, ${action}, 'identity_factor', ${identityId}, ${identityId},
              '{"channel":"interactive"}'::jsonb, '{}'::jsonb)
    `);
  }
}
