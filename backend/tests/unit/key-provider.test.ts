/**
 * T022 — the KeyProvider port. research.md D5.
 *
 * A TOTP secret cannot be hashed: it must be readable on every verification, which
 * makes it the most sensitive recoverable material in the database. The
 * constitution therefore requires it "encrypted at rest under an application-held
 * key that is separate from the database" — so that a dump, a restored backup, or
 * read access to identity_factor is NOT sufficient to derive a working factor.
 *
 * The port has two implementations because the AWS account blockage may be
 * account-wide, in which case KMS is unreachable too and hard-wiring it would
 * reintroduce the halt the v1.5.0 amendment removed. Local for dev and CI, KMS for
 * deployed environments — and T027's startup assertion refuses the local one
 * anywhere it would be wrong.
 */
import { describe, expect, it } from 'vitest';
import { LocalKeyProvider, type KeyProvider } from '../../src/common/auth/key-provider';

/** Two independent 32-byte keys, base64. Test-only and protecting nothing. */
const KEY_A = Buffer.alloc(32, 0xa1).toString('base64');
const KEY_B = Buffer.alloc(32, 0xb2).toString('base64');

const SECRET = Buffer.from('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', 'utf8');

describe('003 KeyProvider (D5)', () => {
  it('wraps and unwraps, returning the original bytes', async () => {
    const provider: KeyProvider = new LocalKeyProvider(KEY_A, 'local:test-a');
    const wrapped = await provider.wrap(SECRET);
    expect(wrapped.keyReference).toBe('local:test-a');
    await expect(provider.unwrap(wrapped.keyReference, wrapped.ciphertext)).resolves.toEqual(SECRET);
  });

  it('THE CIPHERTEXT DOES NOT CONTAIN THE PLAINTEXT', async () => {
    // The whole control in one assertion. If this fails, a dump yields a working
    // second factor and SC-008 is false.
    const provider = new LocalKeyProvider(KEY_A, 'local:test-a');
    const { ciphertext } = await provider.wrap(SECRET);
    expect(ciphertext.includes(SECRET)).toBe(false);
    expect(ciphertext.toString('utf8')).not.toContain('JBSWY3DP');
  });

  it('produces a different ciphertext each time for the same plaintext', async () => {
    // A deterministic wrap would let anyone with read access tell that two
    // identities enrolled the same secret, and would leak far worse under reuse.
    const provider = new LocalKeyProvider(KEY_A, 'local:test-a');
    const first = await provider.wrap(SECRET);
    const second = await provider.wrap(SECRET);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
    await expect(provider.unwrap(first.keyReference, first.ciphertext)).resolves.toEqual(SECRET);
    await expect(provider.unwrap(second.keyReference, second.ciphertext)).resolves.toEqual(SECRET);
  });

  it('a ciphertext wrapped under one key does not unwrap under another', async () => {
    const a = new LocalKeyProvider(KEY_A, 'local:test-a');
    const b = new LocalKeyProvider(KEY_B, 'local:test-b');
    const wrapped = await a.wrap(SECRET);
    await expect(b.unwrap(wrapped.keyReference, wrapped.ciphertext)).rejects.toThrow();
  });

  it('AN UNAVAILABLE KEY THROWS RATHER THAN RETURNING A FALSY RESULT', async () => {
    // FR-017 makes a key outage indistinguishable from a wrong code TO THE CALLER
    // — but that collapse must happen at the sign-in boundary, deliberately, not
    // here by an unwrap quietly returning null and the caller treating it as
    // "code did not match". A silent falsy would make a total key outage look like
    // every user in the system suddenly typing wrong codes, with nothing in the
    // logs distinguishing it. This layer throws; the boundary decides what the
    // person sees.
    const provider = new LocalKeyProvider(KEY_A, 'local:test-a');
    const wrapped = await provider.wrap(SECRET);
    await expect(provider.unwrap('local:some-retired-key', wrapped.ciphertext)).rejects.toThrow();
  });

  it('refuses a tampered ciphertext rather than returning garbage', async () => {
    // Authenticated encryption, not raw CBC: a flipped byte must fail the tag
    // check rather than decrypt to a different secret that then fails
    // verification for a reason nobody can diagnose.
    const provider = new LocalKeyProvider(KEY_A, 'local:test-a');
    const { ciphertext, keyReference } = await provider.wrap(SECRET);
    const tampered = Buffer.from(ciphertext);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0xff;
    await expect(provider.unwrap(keyReference, tampered)).rejects.toThrow();
  });

  it('refuses a key that is not 32 bytes', async () => {
    // A short key is a configuration error that must fail loudly at construction,
    // not silently weaken every secret in the database.
    expect(() => new LocalKeyProvider(Buffer.alloc(16, 1).toString('base64'), 'local:short')).toThrow();
    expect(() => new LocalKeyProvider('not-base64-at-all!!', 'local:bad')).toThrow();
  });
});
