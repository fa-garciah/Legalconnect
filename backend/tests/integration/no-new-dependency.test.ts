/**
 * T002 — 004 adds no runtime dependency. The decision function is arithmetic over
 * data already loaded on the hot path (plan.md, Technical Context).
 *
 * 007 is the first slice to legitimately add runtime dependencies — the AWS SDK v3
 * S3 client and pre-signer, both named in plan.md's Technical Context as required by
 * the constitution's fixed choice of S3 for object storage (Data Residency,
 * `mx-central-1`). The baseline below is updated to include them rather than this
 * test being deleted, so a FUTURE slice adding an unplanned dependency still fails
 * loudly and has to justify it the same way 007 did.
 *
 * 003 adds three more, on the same terms — each named or implied by the constitution
 * rather than chosen here (003/plan.md, Primary Dependencies):
 *
 *   - `otplib`            — named outright by Constitution v1.5.0's Auth stack line.
 *   - `@node-rs/argon2`   — the memory-hard function the constitution requires for
 *                           backup code custody, reused for credentials (003/D6).
 *   - `@aws-sdk/client-kms` — the production `KeyProvider` behind 003/D5's port. The
 *                           `@aws-sdk` family is already here from 007.
 *
 * All three are pinned EXACTLY, with no caret, and that is deliberate: the
 * constitution places `otplib` and the credential verifier inside Principle II's
 * blast radius and requires their upgrades to be reviewed as security changes rather
 * than routine dependency bumps. A caret would let a patch release of an
 * authentication primitive land without review, which is the thing being prevented.
 * A future slice widening any of these three to a range is making a security
 * decision, not a maintenance one.
 */
import { describe, expect, it } from 'vitest';
/*
 * 2026-09-23 — two VERSION bumps, no new dependency. `drizzle-orm` ^0.44 -> ^0.45.3 closes
 * GHSA-gpj5-g38j-94v9 (SQL injection via improperly escaped identifiers), and
 * `@nestjs/platform-express` ^11.0 -> ^11.2.6 closes a high advisory. Both were raised by
 * `npm audit` while clearing the red dependency-scan gate. The set of packages is unchanged,
 * which is what this test exists to guard.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE_DEPENDENCIES = {
  '@aws-sdk/client-kms': '3.1129.0',
  '@aws-sdk/client-s3': '^3.1120.0',
  '@aws-sdk/s3-request-presigner': '^3.1120.0',
  '@nestjs/common': '^11.0.0',
  '@nestjs/core': '^11.0.0',
  '@nestjs/platform-express': '^11.2.6',
  '@node-rs/argon2': '2.2.0',
  'drizzle-orm': '^0.45.3',
  otplib: '13.5.0',
  pg: '^8.13.0',
  'reflect-metadata': '^0.2.2',
  rxjs: '^7.8.1',
};

describe('004 adds no new runtime dependency (baseline updated by 007 and 003)', () => {
  it('package.json "dependencies" is byte-identical to the current baseline', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'));
    expect(pkg.dependencies).toEqual(BASELINE_DEPENDENCIES);
  });
});
