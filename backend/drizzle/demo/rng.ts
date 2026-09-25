/**
 * T004 — the demo firm's one source of "randomness". 022/FR-017, Decision 5.
 *
 * Every arbitrary choice the demo seed makes — which client a matter belongs to, how many
 * documents land on it, which attorney leads it — comes from here, seeded once. Two
 * consequences the slice depends on:
 *
 *   - FR-017: the same data on every machine, so a screenshot of one is a screenshot of all
 *     of them, and a reviewer comparing notes is comparing the same firm.
 *   - FR-014: a second run makes the same choices, which is half of what makes it a no-op
 *     (the other half is `deterministic-id.ts`).
 *
 * `Math.random()` would break both while looking perfectly fine: the data would still be
 * plausible and the counts still roughly right. `demo-rng.test.ts` therefore scans this
 * whole directory for it rather than trusting the convention.
 *
 * Mulberry32 specifically: thirty-odd characters, no dependency, and good enough for
 * fixtures. It is NOT a CSPRNG and nothing here is a secret — the demo credentials are
 * derived from committed phrases (`firm.ts`), never drawn from this generator.
 */

/** Fixed, and the only seed in the slice. Changing it re-rolls the entire demo firm. */
export const DEMO_SEED = 20260925;

export type Random = () => number;

export function mulberry32(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One member of a non-empty list. */
export function pick<T>(next: Random, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: empty list');
  return items[Math.floor(next() * items.length)] as T;
}

/** Fisher–Yates on a copy — callers reuse their input lists. */
export function shuffle<T>(next: Random, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Inclusive at both ends, which is what every caller here wants. */
export function intBetween(next: Random, min: number, max: number): number {
  return min + Math.floor(next() * (max - min + 1));
}
