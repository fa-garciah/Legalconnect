/**
 * T025 — TOTP generation and verification. FR-056, FR-020.
 *
 * `otplib` is named outright by Constitution v1.5.0's Auth stack line and is PINNED
 * EXACTLY, because the constitution places it inside Principle II's blast radius: a
 * defect or an unreviewed upgrade here is an authentication defect, not a
 * dependency bump.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO: single-use enforcement. A code is
 * valid across the whole 90-second window by definition, so a pure verifier cannot
 * tell a first presentation from a replay — re-presentation looks identical to it.
 * FR-020's guarantee therefore lives in `claim_attempt()` (migration 0032), which
 * holds the digests of codes already spent and prunes them to exactly this window.
 * tests/unit/totp-window.test.ts asserts that boundary explicitly so a reader does
 * not look for replay protection here and conclude it is missing.
 */
import { NobleCryptoPlugin, ScureBase32Plugin, TOTP } from 'otplib';

/** RFC 6238's step, and what every authenticator app assumes. */
export const STEP_SECONDS = 30;

/**
 * Previous + current + next = 90 seconds (FR-056).
 *
 * One step either side is RFC 6238's recommendation. It absorbs ordinary
 * phone-clock drift without materially extending the usefulness of a relayed code
 * — which matters because with FR-021's five-attempt lockout, an over-narrow
 * window would convert routine drift into a lockout.
 */
export const WINDOW_SECONDS = STEP_SECONDS * 3;

/**
 * Tolerance is expressed in SECONDS, not steps. Passing 1 here would mean one
 * second rather than one step, and passing 3 would be threefold too wide — the
 * single most likely way to get this wrong, and invisible without a test that
 * asserts the steps OUTSIDE the window are refused.
 */
const EPOCH_TOLERANCE = STEP_SECONDS;

const totp = new TOTP({
  period: STEP_SECONDS,
  digits: 6,
  algorithm: 'sha1',
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

/** A fresh base32 secret. Never logged, never audited, never returned twice. */
export function generateSecret(): string {
  return totp.generateSecret();
}

/** The code a correctly-configured authenticator would show at that instant. */
export async function generateAt(secret: string, epochSeconds: number): Promise<string> {
  return totp.generate({ secret, epoch: epochSeconds });
}

/**
 * True when the code is valid at that instant within FR-056's window.
 *
 * Malformed input is a REFUSAL, not a throw, for the reason the argon2 module
 * gives: a refusal must look identical whatever its cause (FR-022), and an
 * exception escaping as a 500 is a distinguishable outcome.
 */
export async function verifyCode(
  secret: string,
  code: string,
  epochSeconds: number,
): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    const result = await totp.verify(code, {
      secret,
      epoch: epochSeconds,
      epochTolerance: EPOCH_TOLERANCE,
    });
    return result.valid === true;
  } catch {
    return false;
  }
}

/** The otpauth:// URI an authenticator app scans. Carries no credential. */
export function enrollmentUri(secret: string, label: string, issuer: string): string {
  return totp.toURI({ secret, label, issuer });
}
