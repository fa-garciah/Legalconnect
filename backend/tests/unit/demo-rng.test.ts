/**
 * T003 — the demo data is generated, not random. 022/FR-017, Decision 5.
 *
 * Two requirements ride on this one file. FR-017 wants two machines to produce identical
 * data, so a screenshot taken on one is a screenshot of the other. FR-014 wants a second
 * run to change nothing, which is only achievable if every choice — which client gets which
 * matter, how many documents land on it — is the same choice as last time.
 *
 * `Math.random()` would break both silently: the rows would still be plausible, the counts
 * would still be roughly right, and the diff between two runs would be invisible until
 * somebody compared two databases.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_SEED, intBetween, mulberry32, pick, shuffle } from '../../drizzle/demo/rng';

describe('mulberry32', () => {
  it('yields the same sequence from the same seed', () => {
    const a = mulberry32(DEMO_SEED);
    const b = mulberry32(DEMO_SEED);
    const first = Array.from({ length: 20 }, () => a());
    const second = Array.from({ length: 20 }, () => b());
    expect(first).toEqual(second);
  });

  it('yields a different sequence from a different seed', () => {
    const a = Array.from({ length: 10 }, mulberry32(DEMO_SEED));
    const b = Array.from({ length: 10 }, mulberry32(DEMO_SEED + 1));
    expect(a).not.toEqual(b);
  });

  it('stays inside [0, 1)', () => {
    const next = mulberry32(DEMO_SEED);
    for (let i = 0; i < 1000; i += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('the helpers built on it', () => {
  it('pick is stable and always returns a member', () => {
    const items = ['a', 'b', 'c', 'd'] as const;
    const first = Array.from({ length: 12 }, mulberry32(DEMO_SEED)).map(() => 0); // shape only
    expect(first).toHaveLength(12);

    const next = mulberry32(DEMO_SEED);
    const drawn = Array.from({ length: 12 }, () => pick(next, items));
    const again = Array.from({ length: 12 }, () => pick(mulberry32(DEMO_SEED), items));
    expect(drawn.every((d) => items.includes(d))).toBe(true);
    expect(again[0]).toBe(drawn[0]);
  });

  it('shuffle is a permutation, and the same one every time', () => {
    const input = Array.from({ length: 25 }, (_, i) => i);
    const a = shuffle(mulberry32(DEMO_SEED), input);
    const b = shuffle(mulberry32(DEMO_SEED), input);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(input);
    // It must actually shuffle, or "deterministic" would be trivially satisfied.
    expect(a).not.toEqual(input);
  });

  it('shuffle does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5];
    shuffle(mulberry32(DEMO_SEED), input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it('intBetween is inclusive at both ends and never leaves the range', () => {
    const next = mulberry32(DEMO_SEED);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) seen.add(intBetween(next, 3, 7));
    expect(Math.min(...seen)).toBe(3);
    expect(Math.max(...seen)).toBe(7);
  });
});

describe('nothing in the demo generators reaches for real randomness', () => {
  /**
   * The rule this enforces is easy to break by accident — `crypto.randomUUID()` in a
   * generator looks harmless and is exactly what makes a re-run write a second object.
   * Asserted over the directory rather than per file, so a NEW generator added later is
   * covered without anybody remembering to add it here.
   */
  const demoDir = join(__dirname, '..', '..', 'drizzle', 'demo');

  it('uses no Math.random, crypto.randomUUID, randomBytes or Date.now', () => {
    for (const file of readdirSync(demoDir).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(join(demoDir, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      expect(source, `${file} must not use Math.random`).not.toMatch(/Math\.random/);
      expect(source, `${file} must not use randomUUID`).not.toMatch(/randomUUID/);
      expect(source, `${file} must not use randomBytes`).not.toMatch(/randomBytes/);
      // Dates must come from an injected clock, or "same data on two machines" fails the
      // moment the two machines run on different days.
      expect(source, `${file} must not read the wall clock`).not.toMatch(/Date\.now\(\)|new Date\(\)/);
    }
  });
});
