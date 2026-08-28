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
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE_DEPENDENCIES = {
  '@aws-sdk/client-s3': '^3.1120.0',
  '@aws-sdk/s3-request-presigner': '^3.1120.0',
  '@nestjs/common': '^11.0.0',
  '@nestjs/core': '^11.0.0',
  '@nestjs/platform-express': '^11.0.0',
  'drizzle-orm': '^0.44.0',
  pg: '^8.13.0',
  'reflect-metadata': '^0.2.2',
  rxjs: '^7.8.1',
};

describe('004 adds no new runtime dependency (baseline updated by 007, D6/plan.md)', () => {
  it('package.json "dependencies" is byte-identical to the current baseline', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'));
    expect(pkg.dependencies).toEqual(BASELINE_DEPENDENCIES);
  });
});
