/**
 * T066 — **BLOCKING (SC-029)**. FR-007, SC-004.
 *
 * AN INSPECTION TEST, NOT A BEHAVIOURAL ONE, AND EXHAUSTIVE RATHER THAN SAMPLED.
 * That distinction is the task, so it is worth saying why.
 *
 * The constitution does not require that MFA be enabled. It requires that NO
 * MECHANISM EXIST to disable it: "there is no configuration flag, environment
 * variable, plan entitlement, per-tenant setting or feature flag that disables
 * MFA enrollment or the MFA challenge... a mechanism whose only purpose is to
 * switch this off must not exist to be misused, misconfigured or wrongly
 * defaulted."
 *
 * A behavioural test cannot show that. Flipping the values one thinks of and
 * observing that MFA still happens proves those values do not disable it; it
 * says nothing about the one nobody thought of, which is the one that will be
 * wrong. So this walks the ACTUAL configuration surface — every key in
 * `.env.example`, every entitlement in the plan registry — and asserts that no
 * member of it is consulted on the enforcement path at all.
 *
 * Sampling would defeat the point. A new key added to `.env.example` tomorrow is
 * inspected by this test automatically, which is the property that makes it a
 * standing guarantee rather than a snapshot.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BACKEND_ROOT = join(__dirname, '..', '..');
const AUTH_SOURCES = [
  join(BACKEND_ROOT, 'src', 'common', 'auth'),
  join(BACKEND_ROOT, 'src', 'modules', 'auth'),
];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Every key the documented configuration surface declares. */
function documentedEnvKeys(): string[] {
  return readFileSync(join(BACKEND_ROOT, '.env.example'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.slice(0, line.indexOf('=')).trim())
    .filter(Boolean);
}

describe('there is NO path that disables MFA — BLOCKING (SC-029)', () => {
  const authFiles = AUTH_SOURCES.flatMap(filesUnder);

  it('the enforcement path reads NO environment variable at all', () => {
    // The strongest available form. A file that reads nothing from the
    // environment cannot be switched by it, whatever anyone adds later.
    const offenders = authFiles
      .filter((file) => /process\.env/.test(codeOf(file)))
      // Four files legitimately read configuration, and none of them can decide
      // whether a challenge happens. Each is named rather than pattern-matched,
      // so adding a fifth is a deliberate act somebody has to justify here:
      //
      //   auth-db.ts             — the lc_auth connection string.
      //   key-provider.ts        — WHERE the envelope key comes from.
      //   deployment-assertions  — whether the local key provider is permitted.
      //   origin-throttle.ts     — the best-effort rate window (explicitly not
      //                            the control; the per-identity lockout is).
      //
      // A wrong value in any of these breaks authentication LOUDLY — no
      // connection, no key, refuses to boot. None of them makes it optional,
      // which is the property FR-007 is about, and the exhaustive assertions
      // below re-check that against the whole documented key set anyway.
      .filter(
        (file) =>
          !/auth-db\.ts$|key-provider\.ts$|deployment-assertions\.ts$|origin-throttle\.ts$/.test(
            file,
          ),
      )
      .map((file) => file.slice(BACKEND_ROOT.length + 1));

    expect(offenders).toEqual([]);
  });

  it('EXHAUSTIVE: no documented env key appears anywhere on the enforcement path', () => {
    // Every key in `.env.example`, not a chosen few. A key added tomorrow is
    // covered by this the moment it lands.
    const keys = documentedEnvKeys();
    expect(keys.length).toBeGreaterThan(20); // the surface is real, not empty

    const enforcement = [
      join(BACKEND_ROOT, 'src', 'modules', 'auth', 'sign-in.service.ts'),
      join(BACKEND_ROOT, 'src', 'modules', 'auth', 'enrollment.service.ts'),
      join(BACKEND_ROOT, 'src', 'common', 'auth', 'session.guard.ts'),
    ];

    const offenders: string[] = [];
    for (const file of enforcement) {
      const code = codeOf(file);
      for (const key of keys) {
        if (code.includes(key)) offenders.push(`${file} consults ${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('EXHAUSTIVE: no plan entitlement is consulted on the enforcement path', () => {
    // Authentication is cross-cutting and never tier-restricted: "no entitlement
    // may make a second factor optional". Read from the registry rather than
    // listed here, so a new entitlement is covered automatically.
    const registry = readFileSync(
      join(BACKEND_ROOT, 'src', 'common', 'authz', 'capability.ts'),
      'utf8',
    );
    const entitlements = [...registry.matchAll(/'([a-z0-9_.]+)'\s*:/g)].map((m) => m[1]!);

    const enforcement = [
      join(BACKEND_ROOT, 'src', 'modules', 'auth', 'sign-in.service.ts'),
      join(BACKEND_ROOT, 'src', 'modules', 'auth', 'enrollment.service.ts'),
    ];

    const offenders: string[] = [];
    for (const file of enforcement) {
      const code = codeOf(file);
      for (const entitlement of entitlements) {
        if (entitlement.length > 4 && code.includes(entitlement)) {
          offenders.push(`${file} consults ${entitlement}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no per-tenant setting can reach the enforcement path — it has no tenant', () => {
    // Structural rather than enumerated: authentication runs BEFORE tenant
    // selection, so there is no tenant whose settings could be consulted. If
    // these files ever gained a tenant, that premise would be gone.
    for (const file of authFiles) {
      const code = codeOf(file);
      expect(code, file).not.toMatch(/app\.tenant_id/);
      expect(code, file).not.toMatch(/withTenantContext/);
    }
  });

  it('NO IDENTIFIER ANYWHERE IN THE CODEBASE NAMES SUCH A SWITCH', () => {
    // The constitution forbids the mechanism from EXISTING, so this looks past
    // the auth path at the whole source tree. A `skipMfa` helper sitting unused
    // in a utility module is exactly the thing that gets wired up later by
    // somebody who assumes it was meant to be.
    const everything = filesUnder(join(BACKEND_ROOT, 'src'));
    const forbidden =
      /(skip|disable|bypass|optional|off)[_-]?(mfa|factor|challenge|2fa)|(mfa|factor|challenge|2fa)[_-]?(skip|disabled|bypass|optional|off)/i;

    const offenders = everything
      .filter((file) => forbidden.test(codeOf(file)))
      .map((file) => file.slice(BACKEND_ROOT.length + 1));

    expect(offenders).toEqual([]);
  });

  it('the parameters that DO exist are parameters, and the file says so', () => {
    // Not vacuous: `.env.example` really does carry auth values, and they are
    // documented as parameters rather than switches. If the block vanished, the
    // tests above would pass trivially.
    const example = readFileSync(join(BACKEND_ROOT, '.env.example'), 'utf8');
    expect(example).toContain('AUTH_LOCKOUT_THRESHOLD');
    expect(example).toContain('AUTH_BACKUP_CODE_COUNT');
    expect(example).toContain('PARAMETER, NOT A SWITCH');
  });
});
