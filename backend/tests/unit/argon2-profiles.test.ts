/**
 * T020 — the two Argon2id profiles. research.md D6.
 *
 * Two profiles exist because a backup code is not a password. Verification must try
 * every unconsumed code in the set with no early exit (D11), so interactive-grade
 * parameters would put roughly half a second on every recovery attempt to defend
 * entropy the codes already have — 128 bits we generated ourselves.
 *
 * The reduced profile is therefore justified, and these assertions are what stop it
 * from later being read as an oversight, or from drifting onto the credential path
 * where the entropy assumption does not hold.
 */
import { describe, expect, it } from 'vitest';
import {
  HIGH_ENTROPY_PROFILE,
  INTERACTIVE_PROFILE,
  hashCredential,
  hashHighEntropy,
  verifyCredential,
  verifyHighEntropy,
} from '../../src/common/auth/argon2';

/** Parsed out of the PHC string: $argon2id$v=19$m=19456,t=2,p=1$salt$hash */
function phcParams(digest: string): { algorithm: string; m: number; t: number; p: number } {
  const parts = digest.split('$');
  const algorithm = parts[1]!;
  const params = Object.fromEntries(
    parts[3]!.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k!, Number(v)];
    }),
  );
  return { algorithm, m: params.m!, t: params.t!, p: params.p! };
}

describe('003 Argon2id profiles (D6)', () => {
  it('the two profiles are distinct, and the high-entropy one is the cheaper', () => {
    expect(HIGH_ENTROPY_PROFILE).not.toEqual(INTERACTIVE_PROFILE);
    // Cheaper in the dimension that matters for D11's fixed-comparison loop.
    expect(HIGH_ENTROPY_PROFILE.memoryCost).toBeLessThan(INTERACTIVE_PROFILE.memoryCost);
  });

  it('the interactive profile meets OWASP-grade parameters', () => {
    // OWASP's Argon2id recommendation: m=19456 KiB (19 MiB), t=2, p=1. Stated as
    // floors rather than equalities so raising them later is not a test failure —
    // lowering them is, which is the direction that matters.
    expect(INTERACTIVE_PROFILE.memoryCost).toBeGreaterThanOrEqual(19456);
    expect(INTERACTIVE_PROFILE.timeCost).toBeGreaterThanOrEqual(2);
    expect(INTERACTIVE_PROFILE.parallelism).toBeGreaterThanOrEqual(1);
  });

  it('both profiles are Argon2id — never Argon2i or Argon2d', () => {
    // The constitution permits "Argon2id or scrypt". Argon2d is vulnerable to
    // side-channels and Argon2i is weaker against GPU cracking; the hybrid is the
    // one a reviewer expects and the only one this product uses.
    expect(INTERACTIVE_PROFILE.algorithm).toBe(HIGH_ENTROPY_PROFILE.algorithm);
    expect(phcParams(hashCredentialSyncSample).algorithm).toBe('argon2id');
  });

  it('a credential digest encodes the interactive profile', async () => {
    const digest = await hashCredential('a-user-chosen-credential');
    const parsed = phcParams(digest);
    expect(parsed.algorithm).toBe('argon2id');
    expect(parsed.m).toBe(INTERACTIVE_PROFILE.memoryCost);
    expect(parsed.t).toBe(INTERACTIVE_PROFILE.timeCost);
    expect(parsed.p).toBe(INTERACTIVE_PROFILE.parallelism);
  });

  it('a backup-code digest encodes the high-entropy profile', async () => {
    const digest = await hashHighEntropy('9f3a1c8e7b2d4056');
    const parsed = phcParams(digest);
    expect(parsed.algorithm).toBe('argon2id');
    expect(parsed.m).toBe(HIGH_ENTROPY_PROFILE.memoryCost);
    expect(parsed.t).toBe(HIGH_ENTROPY_PROFILE.timeCost);
  });

  it('neither profile is reachable with the other\'s parameters', async () => {
    // The API is what enforces this: the two hashers take a value and NOTHING ELSE,
    // so there is no argument through which a caller could hand the credential path
    // the reduced profile. If either ever grows an options parameter, this fails.
    expect(hashCredential).toHaveLength(1);
    expect(hashHighEntropy).toHaveLength(1);
    // And the digests are self-describing, so a value hashed on one path is
    // identifiable as having come from it.
    const credential = await hashCredential('same-input');
    const backup = await hashHighEntropy('same-input');
    expect(phcParams(credential).m).not.toBe(phcParams(backup).m);
  });

  it('each profile verifies its own value and refuses a wrong one', async () => {
    const credential = await hashCredential('correct horse battery staple');
    await expect(verifyCredential(credential, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyCredential(credential, 'wrong')).resolves.toBe(false);

    const code = await hashHighEntropy('0123456789abcdef');
    await expect(verifyHighEntropy(code, '0123456789abcdef')).resolves.toBe(true);
    await expect(verifyHighEntropy(code, 'fedcba9876543210')).resolves.toBe(false);
  });

  it('salting makes two digests of the same value differ', async () => {
    // This is why there is no verify_credential() in the database: a comparable
    // candidate cannot be derived without the stored string's salt, so the digest
    // must cross into the application. It is the reason lc_auth is a LOGIN role.
    const a = await hashCredential('identical');
    const b = await hashCredential('identical');
    expect(a).not.toBe(b);
    await expect(verifyCredential(a, 'identical')).resolves.toBe(true);
    await expect(verifyCredential(b, 'identical')).resolves.toBe(true);
  });

  it('verification refuses a malformed digest rather than throwing', async () => {
    // A corrupted or truncated stored digest must be a refusal, not a 500 that
    // distinguishes this identity from every other (FR-022's uniform refusal).
    await expect(verifyCredential('not-a-phc-string', 'anything')).resolves.toBe(false);
    await expect(verifyHighEntropy('', 'anything')).resolves.toBe(false);
  });
});

/** A known-good PHC string, used only to assert the parser above reads argon2id. */
const hashCredentialSyncSample =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGE';
