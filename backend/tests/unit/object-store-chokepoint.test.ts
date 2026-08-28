/**
 * T049 — research.md D6, quickstart.md "What to check by hand" #2, made into a real
 * assertion rather than a manual step. `common/storage/object-store/` is the single
 * chokepoint permitted to hold storage credentials — no other module may import the
 * AWS SDK directly, the same "one seam, not one check per endpoint" discipline
 * `common/tenant/` already enforces for RLS context.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const SRC_ROOT = join(__dirname, '..', '..', 'src');
const CHOKEPOINT = join(SRC_ROOT, 'common', 'storage', 'object-store');
const AWS_SDK_IMPORT = /from\s+['"]@aws-sdk\//;

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else if (entry.endsWith('.ts')) files.push(full);
  }
  return files;
}

describe('object store chokepoint (research.md D6)', () => {
  it('no file outside common/storage/object-store/ imports @aws-sdk/*', () => {
    const offenders = walk(SRC_ROOT)
      .filter((file) => !file.startsWith(CHOKEPOINT + sep))
      .filter((file) => AWS_SDK_IMPORT.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(SRC_ROOT.length + 1).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });

  it('the chokepoint itself does import the AWS SDK — the test above is not vacuous', () => {
    const importers = walk(CHOKEPOINT).filter((file) => AWS_SDK_IMPORT.test(readFileSync(file, 'utf8')));
    expect(importers.length).toBeGreaterThan(0);
  });
});
