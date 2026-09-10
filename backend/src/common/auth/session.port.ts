/**
 * T030 — the session port. FR-033 to FR-038, research.md D2 and D8.
 *
 * THE ACCESS CREDENTIAL IS AN OPAQUE HIGH-ENTROPY TOKEN, NOT A SIGNED JWT (D2).
 * The constitution prohibits pure stateless JWT outright, and not on taste:
 * US09-EP12-ASC-ViewActiveSessions and US10-EP12-ASC-RevokeSession require an
 * inventory that can be enumerated and revoked, which a signature and an expiry
 * cannot provide. A JWT's validity is a property of the token; this product needs
 * validity to be a property of a ROW it controls.
 *
 * What is persisted is the token's SHA-256, never the token. A plain hash rather
 * than Argon2id is correct here and the difference from the credential path is
 * worth stating: a 256-bit random token has no guessable structure, so there is
 * nothing for a memory-hard function to defend, and resolution runs on EVERY
 * request — Argon2id per request would be a self-inflicted denial of service.
 */
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { withAuthTransaction, type AuthTx } from './auth-db';

export { withAuthTransaction as withAuthTx };

/** 32 bytes = 256 bits. base64url so it survives a header and a cookie unescaped. */
const TOKEN_BYTES = 32;

/** FR-035. 005 owns idle and absolute expiry by role class; this is the floor. */
export const ACCESS_TTL_MINUTES = 15;

export interface MintedSession {
  /**
   * Returned to the caller EXACTLY ONCE and never recoverable afterwards — the
   * database holds only the digest, so nothing can re-issue this value.
   */
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

export interface ResolvedSession {
  readonly identityId: string;
  readonly expiresAt: Date;
}

/** Device metadata. CARRIES NO PERSONAL DATA beyond user-agent class and coarse origin. */
export type DeviceMetadata = Record<string, string>;

export function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function digestToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Emits one session and the first refresh token of a new family.
 *
 * THE SESSION CARRIES NO TENANT AND NO ARCHETYPE (FR-037). Both are resolved per
 * request from `membership`, and nothing here is trusted as their source
 * (002/FR-016). That separation is what keeps the identity layer replaceable, and
 * it is the reason this slice touches no shipped authorization code.
 */
export async function mintSession(
  tx: AuthTx,
  identityId: string,
  device: DeviceMetadata = {},
): Promise<MintedSession> {
  const accessToken = newToken();
  const refreshToken = newToken();

  const inserted = await tx.execute<{ id: string; expires_at: Date }>(sql`
    INSERT INTO session (identity_id, access_digest, expires_at, device_metadata)
    VALUES (
      ${identityId},
      ${digestToken(accessToken)},
      now() + make_interval(mins => ${ACCESS_TTL_MINUTES}),
      ${JSON.stringify(device)}::jsonb
    )
    RETURNING id, expires_at
  `);

  const row = inserted.rows[0];
  if (!row) throw new Error('session insert returned no row');

  // A fresh family per authentication. Rotation descends from here, and detected
  // reuse revokes this whole lineage (FR-036).
  await tx.execute(sql`
    INSERT INTO refresh_token (family_id, session_id, token_digest, device_metadata)
    VALUES (gen_random_uuid(), ${row.id}, ${digestToken(refreshToken)}, ${JSON.stringify(device)}::jsonb)
  `);

  return {
    accessToken,
    refreshToken,
    sessionId: row.id,
    expiresAt: new Date(row.expires_at),
  };
}

/**
 * FR-034. Null for expired, revoked or unknown — the three are deliberately
 * indistinguishable, and none of them throws. A distinguishable outcome here
 * discloses whether a token ever existed.
 */
export async function resolveSession(tx: AuthTx, accessToken: string): Promise<ResolvedSession | null> {
  const result = await tx.execute<{ identity_id: string; expires_at: Date }>(
    sql`SELECT identity_id, expires_at FROM resolve_session(${digestToken(accessToken)})`,
  );
  const row = result.rows[0];
  return row ? { identityId: row.identity_id, expiresAt: new Date(row.expires_at) } : null;
}

export type RotationOutcome =
  | { readonly kind: 'rotated'; readonly session: MintedSession }
  /** FR-036 — the presented token had already been spent. The family is now dead. */
  | { readonly kind: 'reuse_detected' }
  | { readonly kind: 'refused' };

/**
 * FR-035, FR-036. Rotation and reuse detection, decided inside `rotate_refresh()`
 * under FOR UPDATE on the whole family — see migration 0034 for why the lock has
 * to cover the family rather than the presented row.
 *
 * The replacement tokens are generated HERE and only their digests cross into the
 * database, which is why the SQL function takes digests rather than minting
 * anything itself.
 */
export async function rotateSession(
  tx: AuthTx,
  presentedRefreshToken: string,
  device: DeviceMetadata = {},
): Promise<RotationOutcome> {
  const accessToken = newToken();
  const refreshToken = newToken();

  const result = await tx.execute<{
    rotated: boolean;
    reuse_detected: boolean;
    session_id: string | null;
    expires_at: Date | null;
  }>(sql`
    SELECT rotated, reuse_detected, session_id, expires_at
    FROM rotate_refresh(
      ${digestToken(presentedRefreshToken)},
      ${digestToken(accessToken)},
      ${digestToken(refreshToken)},
      ${JSON.stringify(device)}::jsonb,
      make_interval(mins => ${ACCESS_TTL_MINUTES})
    )
  `);

  const row = result.rows[0];
  if (!row) return { kind: 'refused' };
  if (row.reuse_detected) return { kind: 'reuse_detected' };
  if (!row.rotated || !row.session_id || !row.expires_at) return { kind: 'refused' };

  return {
    kind: 'rotated',
    session: {
      accessToken,
      refreshToken,
      sessionId: row.session_id,
      expiresAt: new Date(row.expires_at),
    },
  };
}

/**
 * Explicit revocation. Takes effect on the NEXT REQUEST, not the next expiry —
 * sessions are this product's own, so this is a write to its own table and there
 * is no external provider holding a parallel notion of validity to disagree.
 */
export async function revokeSession(tx: AuthTx, sessionId: string): Promise<void> {
  await tx.execute(sql`UPDATE session SET revoked_at = now() WHERE id = ${sessionId} AND revoked_at IS NULL`);
}

/** Revokes every live session for an identity. Used when a factor is replaced. */
export async function revokeAllSessionsFor(tx: AuthTx, identityId: string): Promise<void> {
  await tx.execute(
    sql`UPDATE session SET revoked_at = now() WHERE identity_id = ${identityId} AND revoked_at IS NULL`,
  );
}
