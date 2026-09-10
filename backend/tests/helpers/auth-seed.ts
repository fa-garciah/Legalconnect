/**
 * Seeds an identity that can actually sign in: credential, confirmed factor, and
 * the TOTP secret handed back so a test can derive real codes.
 *
 * Extracted once rather than copied per suite. Every 003 test needs the same
 * four steps, and a copy that drifts — a factor left unconfirmed, a credential
 * hashed with the wrong profile — would fail in a way that looks like the code
 * under test rather than like the fixture.
 */
import type { Client } from 'pg';
import { hashCredential } from '../../src/common/auth/argon2';
import { LocalKeyProvider } from '../../src/common/auth/key-provider';
import { generateSecret } from '../../src/common/auth/totp';

export const TEST_CREDENTIAL = 'una-contrasena-larga-de-prueba';

export interface SeededAuthIdentity {
  readonly identityId: string;
  readonly email: string;
  /** Base32, so the caller can generate codes a real authenticator would show. */
  readonly secret: string;
}

export async function seedAuthIdentity(
  migration: Client,
  label: string,
  options: { factor?: boolean; credential?: string } = {},
): Promise<SeededAuthIdentity> {
  const { factor = true, credential = TEST_CREDENTIAL } = options;
  const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `${suffix}@example.com`;

  const { rows } = await migration.query<{ id: string }>(
    `INSERT INTO identity (subject, email) VALUES ($1, $2) RETURNING id`,
    [`lc|${suffix}`, email],
  );
  const identityId = rows[0]!.id;

  await migration.query(`INSERT INTO identity_credential (identity_id, digest) VALUES ($1, $2)`, [
    identityId,
    await hashCredential(credential),
  ]);

  const secret = generateSecret();
  if (factor) {
    const provider = new LocalKeyProvider(process.env.AUTH_LOCAL_KEY!, 'local:env');
    const wrapped = await provider.wrap(Buffer.from(secret, 'utf8'));
    await migration.query(
      `INSERT INTO identity_factor (identity_id, secret_ciphertext, key_reference, confirmed_at)
       VALUES ($1, $2, $3, now())`,
      [identityId, wrapped.ciphertext, wrapped.keyReference],
    );
    await migration.query(`UPDATE identity SET mfa_enrolled_at = now() WHERE id = $1`, [identityId]);
  }

  return { identityId, email, secret };
}
