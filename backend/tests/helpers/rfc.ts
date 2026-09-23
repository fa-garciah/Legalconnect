import { randomInt } from 'node:crypto';

let counter = 0;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * The three-letter prefix, fixed for the life of this worker and DIFFERENT between workers.
 *
 * WHY, AND WHAT IT FIXED. The prefix used to be the literal `TST`, and uniqueness rested on a
 * module-level counter plus six digits of `Date.now()`. The counter is per PROCESS, and
 * Vitest runs test files in parallel workers — each with its own counter starting at 1. Two
 * workers asking for their first RFC in the same millisecond produced the same value, and
 * `tenant_rfc_unique` rejected the second. `document-withdraw-restore.test.ts` failed that way
 * in the full run on 2026-09-21 and passed in isolation, which is the signature of exactly
 * this. The comment here claimed uniqueness came from "the process start"; nothing used it.
 *
 * The first two letters encode the Vitest worker id, so concurrent workers can never share a
 * prefix. The third is random, so a later run landing on the same millisecond-of-cycle and
 * the same counter still differs from rows an earlier run left behind (the database is not
 * reset between runs).
 */
const PREFIX = (() => {
  const worker = Number(process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? randomInt(676));
  const id = Number.isFinite(worker) ? worker % 676 : randomInt(676);
  return LETTERS[Math.floor(id / 26)]! + LETTERS[id % 26]! + LETTERS[randomInt(26)]!;
})();

function base36(value: number, width: number): string {
  let out = '';
  let rest = value;
  for (let i = 0; i < width; i += 1) {
    out = ALNUM[rest % 36]! + out;
    rest = Math.floor(rest / 36);
  }
  return out;
}

/**
 * A syntactically valid, unique RFC for a moral person: 3 letters, 6 digits, 3
 * alphanumerics — the shape `tenant_rfc_shape` enforces.
 *
 * Within a worker the counter guarantees uniqueness (46,656 values before the suffix wraps);
 * across workers the prefix does; across runs the random letter and the time digits make a
 * collision with a persisted row vanishingly unlikely.
 */
export function uniqueRfc(): string {
  counter += 1;
  const digits = String(Date.now()).slice(-6);
  return `${PREFIX}${digits}${base36(counter, 3)}`;
}
