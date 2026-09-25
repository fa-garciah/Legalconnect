/**
 * T007a — the demo firm's fixture credentials never reach the shipped artifact.
 * 022/Principle VI, found by `/speckit-analyze` as the slice's one CRITICAL.
 *
 * THE MISTAKE THIS PINS. The first draft of `022/plan.md` put the demo generators under
 * `src/demo/`. `tsconfig.build.json` excludes the test directory, every test file and the fixture seed
 * — and NOT `src/**`. So `DEMO_PASSWORD`, every TOTP phrase and every backup-code phrase
 * would have been compiled into `dist/` and shipped inside the deployed image.
 *
 * Why the guard does not cover this. `drizzle/demo/guard.ts` decides where the command may
 * WRITE, at runtime. It has nothing to say about what is sitting in an image on a registry.
 * The two controls are complementary and neither substitutes for the other.
 *
 * Why a test rather than a convention: the failure is invisible. Everything passes, the
 * command still works, and the only symptom is a string in a build output nobody reads.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const backendRoot = join(__dirname, '..', '..');

function filesUnder(dir: string, ext = '.ts'): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
      out.push(...filesUnder(full, ext));
    } else if (entry.endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}

describe('tsconfig.build.json', () => {
  /**
   * tsconfig files are JSONC — `tsc` accepts comments, and this repository's build config
   * now carries one explaining the demo exclusions. `JSON.parse` does not, so the comments
   * are stripped here rather than removed from the file: the reader needs them more than
   * the parser does.
   *
   * WHOLE-LINE line comments only, and deliberately NO block-comment rule. A block-comment
   * regex over this file starts matching at the slash-star sequence inside the glob
   * "drizzle/demo/star-star" and stops at the star-slash sequence inside the glob
   * "star-star/star.test.ts", deleting both entries on the way — which is exactly how the
   * first version of this test "failed" against a config that was already correct.
   */
  const buildConfig = JSON.parse(
    readFileSync(join(backendRoot, 'tsconfig.build.json'), 'utf8').replace(
      /^\s*\/\/[^\n]*$/gm,
      '',
    ),
  ) as { exclude?: string[] };

  it('excludes the demo generators and the demo command', () => {
    const exclude = buildConfig.exclude ?? [];
    expect(exclude).toContain('drizzle/demo/**');
    expect(exclude).toContain('drizzle/seed-demo.ts');
  });

  it('still excludes the fixture seed it already excluded', () => {
    // A regression guard on the precedent this slice follows, not a new rule.
    expect(buildConfig.exclude ?? []).toContain('drizzle/seed.ts');
  });
});

describe('nothing under src/ reaches into the demo firm', () => {
  const sourceFiles = filesUnder(join(backendRoot, 'src')).filter((f) => !f.endsWith('.test.ts'));

  it('imports nothing from drizzle/demo/', () => {
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not import the demo firm`).not.toMatch(/from\s+['"].*drizzle\/demo/);
      expect(source, `${file} must not import the demo command`).not.toMatch(
        /from\s+['"].*drizzle\/seed-demo/,
      );
    }
  });

  it('contains no demo credential material', () => {
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not carry the demo password`).not.toContain('DEMO_PASSWORD');
      expect(source, `${file} must not carry a demo TOTP phrase`).not.toContain('demo-totp-');
      expect(source, `${file} must not carry a demo backup-code phrase`).not.toContain('demo-backup-');
    }
  });
});
