/**
 * T032 — the demo seed weakens no authentication control. 022/FR-013, SC-006.
 *
 * WHY THIS TEST EXISTS AT ALL. A command whose purpose is "make it easy to sign in" is the
 * single most likely place in this codebase for somebody to add a shortcut: an env var that
 * skips the challenge, a factor left unconfirmed so the gate waves it through, a lockout
 * pre-cleared. Constitution v1.5.0 is explicit that such a mechanism "must not exist to be
 * misused, misconfigured or wrongly defaulted", and that coverage of the enforcement path is
 * blocking at the same level as tenant isolation.
 *
 * So the demo people get a REAL credential and a REAL confirmed factor, and the way a human
 * signs in as one of them is by typing a TOTP code — which is why the secret is printed.
 *
 * Scoped to files rather than to a diff: a test cannot read a diff, and the requirement is
 * about what these files may contain.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const backendRoot = join(__dirname, '..', '..');
const demoDir = join(backendRoot, 'drizzle', 'demo');

const sources = [
  ...readdirSync(demoDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ name: `drizzle/demo/${f}`, text: readFileSync(join(demoDir, f), 'utf8') })),
  {
    name: 'drizzle/seed-demo.ts',
    text: readFileSync(join(backendRoot, 'drizzle', 'seed-demo.ts'), 'utf8'),
  },
  { name: 'package.json', text: readFileSync(join(backendRoot, 'package.json'), 'utf8') },
];

const code = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/[^\n]*$/gm, '');

describe('no switch exists to turn MFA off', () => {
  it('names no variable that reads like a bypass', () => {
    for (const source of sources) {
      expect(code(source.text), source.name).not.toMatch(
        /(SKIP|BYPASS|DISABLE)[_A-Z]*MFA|MFA[_A-Z]*(SKIP|BYPASS|DISABLE)/i,
      );
      expect(code(source.text), source.name).not.toMatch(
        /(SKIP|BYPASS|DISABLE)[_A-Z]*(FACTOR|CHALLENGE|TOTP)/i,
      );
    }
  });

  it('reads no environment variable beyond the ones it legitimately needs', () => {
    const allowed = new Set([
      'DATABASE_URL_MIGRATION',
      'DATABASE_URL_PLATFORM',
      'NODE_ENV',
      // read via resolveKeyProvider / objectStoreConfigFromEnv, not here, but harmless to allow
      'AUTH_KEY_PROVIDER',
      'AUTH_LOCAL_KEY',
    ]);
    for (const source of sources) {
      if (source.name === 'package.json') continue;
      for (const match of code(source.text).matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
        expect(allowed, `${source.name} reads ${match[1]}`).toContain(match[1] as string);
      }
    }
  });
});

describe('the factor it writes is a real, confirmed one', () => {
  const seed = code(sources.find((s) => s.name === 'drizzle/seed-demo.ts')!.text);

  it('sets confirmed_at on identity_factor', () => {
    expect(seed).toMatch(/identity_factor[\s\S]*confirmed_at/);
  });

  it('sets identity.mfa_enrolled_at in the same pass (FR-004)', () => {
    expect(seed).toMatch(/mfa_enrolled_at/);
  });

  it('never leaves a factor unconfirmed while claiming enrollment', () => {
    // The exact divergence `seed.ts` has today and `enrollment.service.ts:174-182` forbids.
    expect(seed).not.toMatch(/confirmed_at\s*=\s*NULL/i);
  });

  it('never pre-clears a lockout to something other than the enrolled default', () => {
    // Resetting to 0 / NULL as part of an idempotent upsert is the enrolled state, not a
    // relaxation; anything that RAISES the allowance would be.
    expect(seed).not.toMatch(/failed_attempt_count\s*=\s*[1-9]/);
    // Every assignment to `locked_until` must be NULL. Written as an explicit scan over the
    // matches rather than `=\s*(?!NULL)`: in that form `\s*` backtracks to zero width, the
    // lookahead then inspects a space instead of the value, and the assertion passes or fails
    // for the wrong reason. It failed against correct code on the first run.
    const assignments = [...seed.matchAll(/locked_until\s*=\s*([A-Za-z0-9_$]+)/g)].map((m) => m[1]);
    expect(assignments.length).toBeGreaterThan(0);
    for (const value of assignments) expect(value?.toUpperCase()).toBe('NULL');
  });

  it('hashes the credential through the product\'s own interactive profile', () => {
    expect(seed).toContain('hashCredential');
    expect(seed).not.toMatch(/hashHighEntropy\(DEMO_PASSWORD\)/);
  });

  it('hashes backup codes through the high-entropy profile, as enrollment does', () => {
    expect(seed).toContain('hashHighEntropy');
  });

  it('wraps the TOTP secret through the configured key provider, never storing it plainly', () => {
    expect(seed).toContain('resolveKeyProvider');
    expect(seed).toContain('secret_ciphertext');
    // A plaintext secret column would be a constitution violation (custody of TOTP secrets).
    expect(seed).not.toMatch(/secret\s*=\s*\$/);
  });
});

describe('it grants no capability and touches no matrix', () => {
  it('does not import or modify the authorization matrix', () => {
    for (const source of sources) {
      expect(code(source.text), source.name).not.toMatch(/authz\/(matrix|capability)/);
    }
  });

  it('writes no audit row, because fixture setup is not a user journey', () => {
    for (const source of sources) {
      expect(code(source.text), source.name).not.toMatch(/INSERT INTO audit_event/i);
    }
  });
});
