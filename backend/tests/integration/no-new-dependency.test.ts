/**
 * T002 — 004 adds no runtime dependency. The decision function is arithmetic over
 * data already loaded on the hot path (plan.md, Technical Context).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE_DEPENDENCIES = {
  '@nestjs/common': '^11.0.0',
  '@nestjs/core': '^11.0.0',
  '@nestjs/platform-express': '^11.0.0',
  'drizzle-orm': '^0.44.0',
  pg: '^8.13.0',
  'reflect-metadata': '^0.2.2',
  rxjs: '^7.8.1',
};

describe('004 adds no new runtime dependency', () => {
  it('package.json "dependencies" is byte-identical to the pre-004 baseline', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'));
    expect(pkg.dependencies).toEqual(BASELINE_DEPENDENCIES);
  });
});
