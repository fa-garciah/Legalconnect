/**
 * T024 — Argon2id, two profiles. research.md D6.
 *
 * One dependency and one hashing code path for both credentials and backup codes,
 * because a duplicated hashing path is the last thing an authentication layer
 * should have. What differs between them is parameters, and only parameters.
 *
 * `@node-rs/argon2` is PINNED EXACTLY in package.json rather than caret-ranged.
 * The constitution places the credential verifier inside Principle II's blast
 * radius and requires its upgrades reviewed as security changes; a caret would let
 * a patch release of an authentication primitive land without review.
 */
import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Credentials. User-chosen, low-entropy, and offline-brute-forceable if the
 * digests ever leak — so OWASP-grade parameters, and the cost is paid once per
 * sign-in where a person is already waiting.
 *
 * m=19456 KiB (19 MiB), t=2, p=1 is OWASP's Argon2id recommendation.
 */
export const INTERACTIVE_PROFILE = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Backup codes. NOT a password, and the difference is the entire justification:
 *
 *  - 128 bits of randomness THIS PRODUCT generated, not a human-chosen secret, so
 *    there is no meaningful offline brute-force surface to defend;
 *  - verification tries every unconsumed code in the set with no early exit
 *    (research.md D11), so up to ten hashes run per recovery attempt.
 *
 * Interactive parameters here would put roughly half a second on every recovery
 * attempt to defend entropy the codes already have — a self-inflicted denial of
 * service on the path a person reaches only when they have already lost their
 * authenticator.
 *
 * This reduction is deliberate and is asserted in tests/unit/argon2-profiles.test.ts
 * so it is not later read as an oversight. It is valid ONLY while the codes really
 * carry 128 bits: weaken the generator and this profile stops being defensible.
 */
export const HIGH_ENTROPY_PROFILE = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 8192,
  timeCost: 1,
  parallelism: 1,
} as const;

/**
 * Neither hasher takes an options argument, and that is the enforcement rather
 * than a convenience: there is no parameter through which a caller could hand the
 * credential path the reduced profile, or the backup-code path the expensive one.
 */
export async function hashCredential(plain: string): Promise<string> {
  return hash(plain, INTERACTIVE_PROFILE);
}

export async function hashHighEntropy(plain: string): Promise<string> {
  return hash(plain, HIGH_ENTROPY_PROFILE);
}

/**
 * Verification reads the parameters back out of the stored PHC string, so it needs
 * no profile of its own — which is also what makes a digest self-describing about
 * which path produced it.
 *
 * A MALFORMED DIGEST IS A REFUSAL, NOT A THROW. A corrupted or truncated stored
 * value must fail the same way a wrong credential does; an exception here would
 * escape as a 500 and distinguish this identity from every other, which is exactly
 * what FR-022's uniform refusal forbids.
 */
async function verifyAgainst(digest: string, plain: string): Promise<boolean> {
  if (!digest) return false;
  try {
    return await verify(digest, plain);
  } catch {
    return false;
  }
}

export async function verifyCredential(digest: string, plain: string): Promise<boolean> {
  return verifyAgainst(digest, plain);
}

export async function verifyHighEntropy(digest: string, plain: string): Promise<boolean> {
  return verifyAgainst(digest, plain);
}
