/**
 * T084 — position in the set is not observable from response time. D11.
 *
 * The obvious implementation of "check the presented value against each stored
 * digest" returns on the first match. That leaks: a code stored first answers
 * in one Argon2id verification, a code stored tenth in ten. Over repeated
 * attempts an attacker learns roughly where in the set a code sits, and — more
 * usefully — which positions are already consumed, because a consumed row is
 * not in the candidate list at all.
 *
 * So `verifyAgainstSet` compares EVERY unconsumed digest with no early exit.
 * This measures that rather than trusting the absence of a `break`.
 */
import { describe, expect, it } from 'vitest';
import { generateBackupCodeSet, hashBackupCodes, verifyAgainstSet } from '../../src/modules/auth/backup-codes';

/** Median rather than mean: one GC pause should not decide a security claim. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

async function timeVerification(
  candidates: { id: string; digest: string }[],
  presented: string,
  runs = 5,
): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    await verifyAgainstSet(presented, candidates);
    samples.push(performance.now() - started);
  }
  return median(samples);
}

describe('backup code verification is position-independent (D11)', () => {
  it('A MATCH EARLY IN THE SET AND ONE LATE TAKE INDISTINGUISHABLE TIME', async () => {
    const codes = generateBackupCodeSet(10);
    const digests = await hashBackupCodes(codes);
    const candidates = digests.map((digest, index) => ({ id: `code-${index}`, digest }));

    const first = await timeVerification(candidates, codes[0]!);
    const last = await timeVerification(candidates, codes[9]!);

    // Both do ten verifications, so the ratio should sit near 1. The bound is
    // deliberately loose — this runs on shared CI hardware — but an
    // early-exit implementation would be near 0.1, an order of magnitude
    // outside it rather than marginally over.
    const ratio = Math.min(first, last) / Math.max(first, last);
    expect(ratio).toBeGreaterThan(0.6);
  }, 60_000);

  it('A MISS TAKES THE SAME TIME AS A MATCH', async () => {
    // The one an attacker actually probes with. If a miss were slower — ten
    // verifications versus an average of five — then "wrong code" and "right
    // code, wrong something-else" would be distinguishable.
    const codes = generateBackupCodeSet(10);
    const digests = await hashBackupCodes(codes);
    const candidates = digests.map((digest, index) => ({ id: `code-${index}`, digest }));

    const hit = await timeVerification(candidates, codes[4]!);
    const miss = await timeVerification(candidates, 'ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-Z');

    const ratio = Math.min(hit, miss) / Math.max(hit, miss);
    expect(ratio).toBeGreaterThan(0.6);
  }, 60_000);

  it('the work scales with the CANDIDATE COUNT, not with where the match falls', async () => {
    // The positive control. If timing were flat regardless of set size, the
    // measurements above would be meaningless — they would be measuring
    // something other than the comparisons.
    const codes = generateBackupCodeSet(10);
    const digests = await hashBackupCodes(codes);
    const all = digests.map((digest, index) => ({ id: `code-${index}`, digest }));
    const two = all.slice(0, 2);

    const withTen = await timeVerification(all, codes[0]!);
    const withTwo = await timeVerification(two, codes[0]!);

    expect(withTen).toBeGreaterThan(withTwo);
  }, 60_000);

  it('returns the right id regardless of position — correctness, not just timing', async () => {
    const codes = generateBackupCodeSet(10);
    const digests = await hashBackupCodes(codes);
    const candidates = digests.map((digest, index) => ({ id: `code-${index}`, digest }));

    expect(await verifyAgainstSet(codes[0]!, candidates)).toBe('code-0');
    expect(await verifyAgainstSet(codes[9]!, candidates)).toBe('code-9');
    expect(await verifyAgainstSet('not-a-code', candidates)).toBeNull();
  }, 60_000);
});
