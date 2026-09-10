/**
 * T021 — the TOTP acceptance window. FR-020, FR-056, SC-034.
 *
 * FR-056 fixes a 30-second step and a 90-second window: previous, current and next.
 * FR-020 then requires that a code accepted anywhere in that window cannot be
 * accepted again ANYWHERE in it — "not merely within the step it was generated
 * from", because a guard covering only the current step leaves a used code reusable
 * from the neighbouring steps it was accepted from.
 *
 * The window is not generosity. With FR-021's five-attempt lockout, an over-narrow
 * window would convert ordinary phone-clock drift into a lockout — which is why
 * this file asserts BOTH edges: the three steps inside are accepted, and every step
 * outside is refused. An implementation that accepted everything would pass half of
 * these and is exactly what the second half exists to catch.
 */
import { describe, expect, it } from 'vitest';
import { STEP_SECONDS, WINDOW_SECONDS, generateAt, generateSecret, verifyCode } from '../../src/common/auth/totp';

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
/** A fixed instant, so nothing here depends on when the suite happens to run. */
const NOW = 1_800_000_000;

describe('003 TOTP window (FR-056) and replay surface (FR-020)', () => {
  it('uses a 30-second step and a 90-second window', () => {
    expect(STEP_SECONDS).toBe(30);
    // Previous + current + next = three steps = 90 seconds.
    expect(WINDOW_SECONDS).toBe(90);
  });

  it('generates a 6-digit code', async () => {
    const code = await generateAt(SECRET, NOW);
    expect(code).toMatch(/^\d{6}$/);
  });

  it('accepts the previous, current and next step', async () => {
    for (const offset of [-STEP_SECONDS, 0, STEP_SECONDS]) {
      const code = await generateAt(SECRET, NOW + offset);
      await expect(verifyCode(SECRET, code, NOW)).resolves.toBe(true);
    }
  });

  it('refuses every step outside the window', async () => {
    // Two steps out in each direction, and further. If any of these passes, the
    // tolerance was configured in steps where the library expects seconds — the
    // single most likely way to get this wrong, and silently threefold too wide.
    for (const offset of [-3 * STEP_SECONDS, -2 * STEP_SECONDS, 2 * STEP_SECONDS, 3 * STEP_SECONDS, 3600]) {
      const code = await generateAt(SECRET, NOW + offset);
      await expect(verifyCode(SECRET, code, NOW)).resolves.toBe(false);
    }
  });

  it('refuses a code derived from a different secret', async () => {
    const other = await generateAt('KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU', NOW);
    await expect(verifyCode(SECRET, other, NOW)).resolves.toBe(false);
  });

  it('refuses malformed input rather than throwing', async () => {
    // A refusal must look identical whatever the cause (FR-022). A thrown error
    // would be a distinguishable outcome.
    for (const bad of ['', '12345', '1234567', 'abcdef', '  123456  ']) {
      await expect(verifyCode(SECRET, bad, NOW)).resolves.toBe(false);
    }
  });

  it('generateSecret returns a distinct base32 secret each time', async () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
    // Base32 alphabet, and long enough to carry at least 128 bits.
    expect(a).toMatch(/^[A-Z2-7]+$/);
    expect(a.length).toBeGreaterThanOrEqual(26);
    // Round-trips through generation and verification.
    await expect(verifyCode(a, await generateAt(a, NOW), NOW)).resolves.toBe(true);
  });

  it('THE SAME CODE IS VALID ACROSS THE WHOLE WINDOW — which is why FR-020 exists here and not in this module', async () => {
    // This is the assertion that motivates the replay guard's placement. A code
    // generated for the previous step verifies at the current instant, and would
    // still verify one step later. Nothing this module can do prevents that: the
    // window is a REQUIREMENT, and re-presentation is legitimate-looking to a pure
    // verifier.
    //
    // So the single-use guarantee cannot live here. It lives in claim_attempt()
    // (migration 0032), which holds the digests of codes already spent and prunes
    // them to exactly this window. This test documents the boundary between the
    // two, so a future reader does not look for replay protection in this file and
    // conclude it is missing.
    // One code, three instants a full step apart, all accepted. The window is
    // centred on the VERIFYING instant, so a code from step k is live from k-30 to
    // k+30 — sixty seconds during which re-presenting it is indistinguishable from
    // presenting it, to anything that only checks the maths.
    const code = await generateAt(SECRET, NOW);
    await expect(verifyCode(SECRET, code, NOW - STEP_SECONDS)).resolves.toBe(true);
    await expect(verifyCode(SECRET, code, NOW)).resolves.toBe(true);
    await expect(verifyCode(SECRET, code, NOW + STEP_SECONDS)).resolves.toBe(true);
  });
});
