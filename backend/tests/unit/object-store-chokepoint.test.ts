/**
 * T049 — research.md D6, quickstart.md "What to check by hand" #2, made into a real
 * assertion rather than a manual step. `common/storage/object-store/` is the single
 * chokepoint permitted to hold storage credentials — no other module may import the
 * AWS SDK directly, the same "one seam, not one check per endpoint" discipline
 * `common/tenant/` already enforces for RLS context.
 *
 * GENERALISED BY 003. The rule was written when the object store was the only thing
 * in this codebase talking to AWS, so "no @aws-sdk outside this one directory" and
 * "storage credentials live in one place" were the same sentence. They are not any
 * more: 003 needs `@aws-sdk/client-kms` for the TOTP envelope key (research.md D5),
 * which is key management rather than object storage and has no business inside the
 * storage chokepoint.
 *
 * So the rule is now stated as what it always meant — EACH AWS SDK PACKAGE HAS
 * EXACTLY ONE OWNING DIRECTORY — which is strictly stronger than the original: it
 * still forbids scattered SDK usage, and it additionally forbids the storage
 * chokepoint from quietly acquiring a KMS client, or the key provider an S3 one.
 * Adding a package here is a deliberate act with a named owner, which is the
 * property worth keeping.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const SRC_ROOT = join(__dirname, '..', '..', 'src');

/** AWS SDK package prefix → the one directory allowed to import it. */
const OWNERS: ReadonlyArray<readonly [string, string]> = [
  // 007/D6. Storage credentials, pre-signing, bucket access.
  ['@aws-sdk/client-s3', join('common', 'storage', 'object-store')],
  ['@aws-sdk/s3-request-presigner', join('common', 'storage', 'object-store')],
  // 003/D5. The TOTP envelope key. Deliberately NOT the storage chokepoint: this
  // key is the one thing standing between a database dump and a working second
  // factor, and its access is audited to the PAC/CSD standard (FR-016). Keeping it
  // in its own module is what makes that access reviewable in one place.
  ['@aws-sdk/client-kms', join('common', 'auth')],
];

const anySdkImport = /from\s+['"](@aws-sdk\/[a-z0-9-]+)['"]/g;

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

function relative(file: string): string {
  return file.slice(SRC_ROOT.length + 1).replace(/\\/g, '/');
}

/** Every (file, sdk package) pair in the source tree. */
function sdkImports(): Array<{ file: string; pkg: string }> {
  const found: Array<{ file: string; pkg: string }> = [];
  for (const file of walk(SRC_ROOT)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(anySdkImport)) {
      found.push({ file, pkg: match[1]! });
    }
  }
  return found;
}

describe('AWS SDK chokepoints (007/D6, generalised by 003/D5)', () => {
  it('every @aws-sdk import sits in its package\'s one owning directory', () => {
    const offenders = sdkImports()
      .filter(({ file, pkg }) => {
        const owner = OWNERS.find(([name]) => name === pkg)?.[1];
        // An unowned package is an offender too: a new AWS dependency must name
        // its owner here rather than appearing wherever it was first needed.
        if (!owner) return true;
        return !file.startsWith(join(SRC_ROOT, owner) + sep);
      })
      .map(({ file, pkg }) => `${relative(file)} imports ${pkg}`);

    expect(offenders).toEqual([]);
  });

  it('each owning directory really does import its package — the test above is not vacuous', () => {
    const imports = sdkImports();
    for (const [pkg, owner] of OWNERS) {
      const importers = imports.filter(
        ({ file, pkg: p }) => p === pkg && file.startsWith(join(SRC_ROOT, owner) + sep),
      );
      expect(importers.length, `${owner} should import ${pkg}`).toBeGreaterThan(0);
    }
  });

  it('the storage chokepoint holds no key-management client, and vice versa', () => {
    // The generalisation's own teeth. Before 003 this was implied by there being
    // one directory; now it has to be said.
    const imports = sdkImports();
    const storage = join(SRC_ROOT, 'common', 'storage', 'object-store') + sep;
    const auth = join(SRC_ROOT, 'common', 'auth') + sep;

    expect(imports.filter((i) => i.file.startsWith(storage) && i.pkg.includes('kms'))).toEqual([]);
    expect(imports.filter((i) => i.file.startsWith(auth) && i.pkg.includes('s3'))).toEqual([]);
  });
});
