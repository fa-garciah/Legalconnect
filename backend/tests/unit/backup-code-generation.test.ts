/**
 * T023 — backup code generation. FR-031.
 *
 * Exactly ten codes per set, each 128 bits of randomness this product generates.
 * The entropy is what justifies the reduced Argon2id profile (D6), so these two
 * facts are load-bearing on each other: weaken the codes and the cheaper hash stops
 * being defensible.
 */
import { describe, expect, it } from 'vitest';
import { BACKUP_CODE_COUNT, generateBackupCodeSet } from '../../src/modules/auth/backup-codes';

describe('003 backup code generation (FR-031)', () => {
  it('issues exactly ten codes', () => {
    expect(BACKUP_CODE_COUNT).toBe(10);
    expect(generateBackupCodeSet()).toHaveLength(10);
  });

  it('each code carries at least 128 bits of entropy', () => {
    // Crockford-style base32, 26 characters => 26 * 5 = 130 bits. Asserted through
    // the alphabet and length rather than by measuring randomness, which a unit
    // test cannot do meaningfully.
    for (const code of generateBackupCodeSet()) {
      const alphabet = code.replace(/-/g, '');
      expect(alphabet).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
      expect(alphabet.length * Math.log2(32)).toBeGreaterThanOrEqual(128);
    }
  });

  it('no two codes within a set collide', () => {
    const set = generateBackupCodeSet();
    expect(new Set(set).size).toBe(set.length);
  });

  it('no two sets collide', () => {
    // Sampled rather than exhaustive, which is all a test can do. At 128 bits a
    // real collision here would mean the generator is not random at all — which is
    // the failure this catches, not a birthday collision.
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      for (const code of generateBackupCodeSet()) {
        expect(seen.has(code)).toBe(false);
        seen.add(code);
      }
    }
    expect(seen.size).toBe(500);
  });

  it('excludes visually ambiguous characters', () => {
    // These are transcribed by hand off a screen, once, under mild stress. I, L, O
    // and U are excluded so a person reading their own handwriting back does not
    // lose access to a live matter over a 1 and an I.
    const all = generateBackupCodeSet(200).join('');
    for (const ambiguous of ['I', 'L', 'O', 'U']) {
      expect(all).not.toContain(ambiguous);
    }
  });

  it('honours an explicit count, because the set size is configuration', () => {
    // AUTH_BACKUP_CODE_COUNT is a PARAMETER, not a switch: it changes how many
    // codes are issued and can never disable enrollment or the challenge (FR-007).
    expect(generateBackupCodeSet(4)).toHaveLength(4);
  });

  it('refuses a count of zero, which would be a disable path', () => {
    // FR-023 makes enrollment incomplete without codes. A set of zero would be a
    // configuration value that silently removes recovery, which is the shape of
    // thing FR-007 forbids existing at all.
    expect(() => generateBackupCodeSet(0)).toThrow();
    expect(() => generateBackupCodeSet(-1)).toThrow();
  });
});
