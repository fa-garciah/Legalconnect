/**
 * T028 — backup code generation and verification. FR-023 to FR-031, research.md D11.
 *
 * Constitution v1.5.0 reframed this material: under the previous identity provider
 * holding backup codes was a NAMED EXCEPTION, granted because no vendor supplied
 * them. With a self-hosted identity layer there is no provider for it to be an
 * exception to — building and holding this IS the design, and it is a permanent
 * property of it rather than a gap awaiting a better vendor (Recognised Technical
 * Debt item 8).
 *
 * A bug on this path is an AUTHENTICATION BYPASS, not a leak. Coverage is blocking
 * in CI on the same footing as tenant isolation.
 */
import { randomInt } from 'node:crypto';
import { hashHighEntropy, verifyHighEntropy } from '../../common/auth/argon2';

/** FR-031. Overridable per call because AUTH_BACKUP_CODE_COUNT is configuration. */
export const BACKUP_CODE_COUNT = 10;

/**
 * Crockford-style base32, minus I, L, O and U.
 *
 * These are transcribed by hand off a screen, exactly once, by someone who is
 * setting up an account and not paying full attention. The excluded characters are
 * the ones that get read back wrong from one's own handwriting — and the cost of
 * that is losing access to a live matter, with no archetype able to reset it
 * (FR-055 puts recovery entirely in the person's own hands).
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 26 characters * log2(32) = 130 bits, comfortably over the 128 FR-031 wants. */
const CODE_CHARS = 26;
/** Grouped for legibility when read aloud or copied down. Hyphens are not entropy. */
const GROUP = 5;

function oneCode(): string {
  let raw = '';
  for (let i = 0; i < CODE_CHARS; i += 1) {
    // randomInt is the rejection-sampling CSPRNG path. Math.random() would be a
    // catastrophic and completely invisible downgrade here.
    raw += ALPHABET[randomInt(ALPHABET.length)];
  }
  return (raw.match(new RegExp(`.{1,${GROUP}}`, 'g')) ?? [raw]).join('-');
}

/**
 * A fresh set. Every code in it is independent — there is no derivation from a
 * seed, so compromising one tells an attacker nothing about the other nine.
 */
export function generateBackupCodeSet(count: number = BACKUP_CODE_COUNT): string[] {
  if (!Number.isInteger(count) || count < 1) {
    // A set of zero would silently remove recovery while leaving enrollment
    // apparently complete — the shape of thing FR-007 forbids existing at all.
    // FR-023 makes enrollment incomplete without codes, so this cannot be a
    // permitted configuration.
    throw new Error(`backup code count must be a positive integer, got ${count}`);
  }
  const set = new Set<string>();
  while (set.size < count) set.add(oneCode());
  return [...set];
}

/** Storage form. Never the code itself — FR-025. */
export async function hashBackupCodes(codes: readonly string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => hashHighEntropy(code)));
}

/** Extends Record so a driver row satisfies it without a cast at the call site. */
export interface StoredBackupCode extends Record<string, unknown> {
  readonly id: string;
  readonly digest: string;
}

/**
 * FR-026 and research.md D11 — verification with a FIXED COMPARISON COUNT.
 *
 * The obvious implementation returns as soon as a digest matches. That leaks the
 * matched code's POSITION in the set through response time: a code stored first
 * answers in one hash, a code stored tenth in ten. Over repeated attempts that is
 * a usable signal about which codes remain unconsumed.
 *
 * So every unconsumed digest is compared, always, and the loop does not break on a
 * match. The cost is bounded and known — ten high-entropy-profile verifications,
 * which is precisely why that profile exists (D6).
 *
 * Comparisons run SEQUENTIALLY rather than through Promise.all: concurrent hashing
 * would let the runtime finish them out of order and reintroduce a timing signal
 * through scheduling, and it would multiply peak memory by the parallelism.
 *
 * Returns the matching id, or null. Never which position matched, and never how
 * many candidates there were.
 */
export async function verifyAgainstSet(
  presented: string,
  candidates: readonly StoredBackupCode[],
): Promise<string | null> {
  let matched: string | null = null;
  for (const candidate of candidates) {
    const isMatch = await verifyHighEntropy(candidate.digest, presented);
    // Deliberately no `break`. Assigning rather than returning is what keeps the
    // work done independent of where the match fell.
    if (isMatch && matched === null) matched = candidate.id;
  }
  return matched;
}
