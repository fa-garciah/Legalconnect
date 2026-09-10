/**
 * T052 — the credential step and the challenge step. FR-001 to FR-005, FR-018 to
 * FR-022, FR-033 to FR-038, FR-056.
 *
 * THE UNIFORM REFUSAL IS THE ORGANISING PRINCIPLE OF THIS FILE. Every failure —
 * an email with no identity, a wrong credential, a locked identity, a wrong code,
 * a replayed code, an expired challenge, an unavailable key — reaches ONE thrown
 * error with one body (FR-022, FR-055, SC-017). There is deliberately no branch a
 * caller can observe, and the internal reasons exist only to decide what to audit.
 *
 * That is why `refuse()` is the single exit: a future contributor adding a case
 * has to route it through the same door rather than inventing a second response
 * shape, which is how uniformity decays.
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { withAuthTransaction, type AuthTx } from '../../common/auth/auth-db';
import { verifyCredential } from '../../common/auth/argon2';
import { resolveKeyProvider } from '../../common/auth/key-provider';
import { verifyCode } from '../../common/auth/totp';
import { mintSession, rotateSession, type MintedSession } from '../../common/auth/session.port';
import { signInOriginThrottle } from '../../common/auth/origin-throttle';

/**
 * The one refusal. Never varied, never explained.
 *
 * IT IS THROWN OUTSIDE THE TRANSACTION, ALWAYS. Throwing inside rolls back — and
 * a failed attempt has two side effects that MUST survive the refusal: the
 * lockout counter, and the `signin.failed` / `challenge.failed` audit entry.
 * Rolling those back leaves a system where the counter never reaches five, the
 * lockout can never trip, and the audit log — the only detection net the product
 * has while the primary factor is phishable — records nothing at all about failed
 * authentication. Every failure would look, from the outside, exactly like an
 * attack that had never happened.
 *
 * So each method computes an OUTCOME inside the transaction, lets it commit, and
 * refuses after. The type below is what keeps that structure from being quietly
 * undone by someone adding one more early throw.
 */
function refuse(): never {
  throw new UnauthorizedException({
    error: 'authentication_failed',
    message: 'No fue posible completar el acceso.',
  });
}

const digest = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
const opaqueToken = (): string => randomBytes(32).toString('base64url');

export interface CredentialStepResult {
  readonly challengeToken: string;
  /** `factor` when a confirmed factor exists, `enrollment` when it does not (FR-006). */
  readonly next: 'factor' | 'enrollment';
}

export interface SessionResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: string;
}

interface IdentityRow extends Record<string, unknown> {
  identity_id: string;
  digest: string | null;
  // Typed as `unknown` on purpose. `tx.execute()` returns driver rows without
  // Drizzle's column mapping, so a timestamptz may arrive as a Date OR as a
  // string depending on the driver's parser configuration. Typing these as Date
  // compiles cleanly and then compares a string against a Date at runtime, which
  // JS resolves lexicographically between two unrelated formats and silently
  // answers false — a lockout that never fires, with nothing failing loudly.
  // Coerced through `asDate()` below rather than trusted.
  confirmed_at: unknown;
  locked_until: unknown;
}

/** Narrows a driver timestamp to a Date, whichever shape it arrived in. */
function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && value.length > 0) return new Date(value);
  return null;
}

@Injectable()
export class SignInService {
  /**
   * The credential step. Emits NO session (FR-003) — only the state that makes
   * the challenge reachable.
   */
  async signIn(email: string, credential: string, origin: string): Promise<CredentialStepResult> {
    // Best-effort and explicitly not the control (D7). The per-identity lockout
    // below is what actually defends an account; this bounds the log volume one
    // source can generate against one instance. A refusal here is
    // indistinguishable from any other.
    if (!signInOriginThrottle.record(origin).allowed) refuse();

    type Outcome =
      | { kind: 'ok'; result: CredentialStepResult }
      | { kind: 'refused' };

    const outcome = await withAuthTransaction<Outcome>(async (tx) => {
      const found = await tx.execute<IdentityRow>(sql`
        SELECT i.id AS identity_id,
               c.digest,
               f.confirmed_at,
               f.locked_until
          FROM identity i
          LEFT JOIN identity_credential c ON c.identity_id = i.id
          LEFT JOIN identity_factor     f ON f.identity_id = i.id
         WHERE lower(btrim(i.email)) = lower(btrim(${email}))
      `);

      const row = found.rows[0];

      // NO EARLY RETURN FOR AN UNKNOWN EMAIL. Answering immediately while a real
      // email costs an Argon2id verification makes the two distinguishable by
      // response time, which is SC-017's whole concern. A dummy verification
      // against a fixed digest spends the same work.
      const storedDigest = row?.digest ?? DUMMY_DIGEST;
      const credentialOk = await verifyCredential(storedDigest, credential);

      if (!row || !row.digest || !credentialOk) {
        await this.audit(tx, 'signin.failed', row?.identity_id);
        return { kind: 'refused' };
      }

      // FR-005 shares FR-021's threshold, so a locked identity is refused at the
      // credential step too — and indistinguishably (FR-055).
      const lockedUntil = asDate(row.locked_until);
      if (lockedUntil && lockedUntil.getTime() > Date.now()) {
        await this.audit(tx, 'signin.failed', row.identity_id);
        return { kind: 'refused' };
      }

      const challengeToken = opaqueToken();

      if (!asDate(row.confirmed_at)) {
        // FR-006, US1 scenario 7. Routed to enrollment, holding no session and
        // reaching no authenticated capability on the way. This token is not
        // stored: replaying it only begins enrollment again, which FR-012 already
        // makes safe by discarding the prior unconfirmed secret.
        return {
          kind: 'ok',
          result: { challengeToken: this.enrollmentToken(row.identity_id), next: 'enrollment' },
        };
      }

      const issued = await tx.execute<{ issue_challenge: boolean }>(
        sql`SELECT issue_challenge(${row.identity_id}, ${digest(challengeToken)}) AS issue_challenge`,
      );
      if (!issued.rows[0]?.issue_challenge) return { kind: 'refused' };

      return { kind: 'ok', result: { challengeToken, next: 'factor' } };
    });

    if (outcome.kind === 'refused') refuse();
    return outcome.result;
  }

  /**
   * The challenge step. Verifies the second factor and emits exactly one session.
   *
   * ORDER MATTERS HERE. The challenge is PEEKED, not consumed, until the code
   * verifies — a wrong code must spend an attempt without burning the token, or
   * FR-021's five attempts would be unreachable in practice because each mistake
   * would send the person back to re-enter their credential.
   */
  async completeChallenge(challengeToken: string, code: string): Promise<SessionResult> {
    type Outcome = { kind: 'ok'; result: SessionResult } | { kind: 'refused' };

    const outcome = await withAuthTransaction<Outcome>(async (tx) => {
      const peeked = await tx.execute<{ peek_challenge: string | null }>(
        sql`SELECT peek_challenge(${digest(challengeToken)}) AS peek_challenge`,
      );
      const identityId = peeked.rows[0]?.peek_challenge ?? null;
      if (!identityId) return { kind: 'refused' };

      const factor = await tx.execute<{ secret_ciphertext: Buffer; key_reference: string }>(
        sql`SELECT secret_ciphertext, key_reference FROM identity_factor WHERE identity_id = ${identityId}`,
      );
      const stored = factor.rows[0];
      if (!stored) return { kind: 'refused' };

      let codeOk = false;
      try {
        const secret = await resolveKeyProvider().unwrap(
          stored.key_reference,
          Buffer.from(stored.secret_ciphertext),
        );
        codeOk = await verifyCode(secret.toString('utf8'), code, Math.floor(Date.now() / 1000));
      } catch {
        // FR-017. A key outage fails CLOSED and is indistinguishable from a wrong
        // code to the person. The distinguishable signal is a monitoring concern
        // and is deliberately absent from this response — plan.md open item 3.
        codeOk = false;
      }

      // One indivisible step: lockout check, replay guard across the full
      // 90-second window, and the counter (FR-020, FR-021). It receives a digest
      // of the PRESENTED code, never the code and never the secret.
      const claimed = await tx.execute<{ admitted: boolean; locked: boolean }>(
        sql`SELECT admitted, locked FROM claim_attempt(${identityId}, ${digest(code)}, ${codeOk})`,
      );
      const verdict = claimed.rows[0];

      if (!verdict?.admitted) {
        // These two writes are the reason this method commits before refusing.
        await this.audit(tx, 'challenge.failed', identityId);
        if (verdict?.locked) await this.audit(tx, 'account.locked', identityId);
        return { kind: 'refused' };
      }

      // Only now. Consumption is compare-and-clear under FOR UPDATE, so two
      // simultaneous presentations of this token yield exactly one session.
      const consumed = await tx.execute<{ consume_challenge: string | null }>(
        sql`SELECT consume_challenge(${digest(challengeToken)}) AS consume_challenge`,
      );
      if (!consumed.rows[0]?.consume_challenge) return { kind: 'refused' };

      const session = await mintSession(tx, identityId, {});
      await this.audit(tx, 'signin.succeeded', identityId);
      return { kind: 'ok', result: this.toResult(session) };
    });

    if (outcome.kind === 'refused') refuse();
    return outcome.result;
  }

  /** FR-035, FR-036. Reuse revokes the whole family and is not announced. */
  async refresh(refreshToken: string): Promise<SessionResult> {
    // FR-036 in particular: detected reuse REVOKES THE WHOLE FAMILY, and that
    // revocation must commit even though the caller is refused. Rolling it back
    // would leave a captured token's lineage alive after the system had already
    // detected the theft.
    const outcome = await withAuthTransaction(async (tx) => rotateSession(tx, refreshToken, {}));

    if (outcome.kind !== 'rotated') refuse();
    return this.toResult(outcome.session);
  }

  private toResult(session: MintedSession): SessionResult {
    // No tenant and no archetype in this response (FR-037). Which firms this
    // person may reach is a separate call, and the active tenant is named per
    // request as it always was.
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  /**
   * A short-lived encrypted token for the enrollment path. Stateful storage would
   * need an `identity_factor` row, and an unenrolled identity has none.
   */
  private enrollmentToken(identityId: string): string {
    return Buffer.from(
      JSON.stringify({ i: identityId, e: Date.now() + 5 * 60_000, p: 'enrollment' }),
      'utf8',
    ).toString('base64url');
  }

  /**
   * `tenant_id NULL`, identity by reference, and NEVER the email, the code or any
   * factor material (FR-043, FR-045). The sanitiser's deny-list enforces the last
   * part independently.
   */
  private async audit(tx: AuthTx, action: string, identityId?: string): Promise<void> {
    await tx.execute(sql`
      INSERT INTO audit_event (tenant_id, action, target_entity, target_id, actor_identity_id, source, metadata)
      VALUES (NULL, ${action}, 'identity', ${identityId ?? null}, ${identityId ?? null},
              '{"channel":"interactive"}'::jsonb, '{}'::jsonb)
    `);
  }
}

/**
 * A real Argon2id digest of a value nobody holds, used to spend the same work on
 * an unknown email as on a known one. Interactive profile, so the timing matches.
 */
const DUMMY_DIGEST =
  '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$3+5S2Zx3cXhZ2i9lJ8VYQVvVJ1n1r5cN0kQKX0m0Xzo';
