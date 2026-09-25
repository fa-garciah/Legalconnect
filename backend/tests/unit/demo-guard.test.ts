/**
 * T001 — the demo seed's two refusals. 022/FR-012, Decision 3.
 *
 * WHY THIS TEST IS FIRST IN THE SLICE. Every later task runs the command, and running it
 * once against the wrong database is not recoverable by noticing afterwards: it writes
 * known credentials for known people. The guard therefore exists before anything that
 * could invoke it.
 *
 * The two checks are deliberately inverted with respect to each other — environments are
 * a DENY-list and hosts are an ALLOW-list — so that an unrecognised value inherits
 * refusal in both dimensions. `deployment-assertions.ts:26-32` reasons this out for
 * NODE_ENV and this slice reuses that function rather than restating the list.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DemoSeedRefused, assertLocalDemoTarget } from '../../drizzle/demo/guard';

const local = (host: string): NodeJS.ProcessEnv => ({
  DATABASE_URL_MIGRATION: `postgresql://lc_migration:pw@${host}:5455/legalconnect`,
});

describe('assertLocalDemoTarget — deployed environments', () => {
  for (const nodeEnv of ['production', 'staging']) {
    it(`refuses NODE_ENV=${nodeEnv} even when the host is local`, () => {
      expect(() => assertLocalDemoTarget({ ...local('localhost'), NODE_ENV: nodeEnv })).toThrow(
        DemoSeedRefused,
      );
    });
  }

  it('permits an unset NODE_ENV, which is the ordinary local case', () => {
    expect(() => assertLocalDemoTarget(local('localhost'))).not.toThrow();
  });

  it('permits NODE_ENV=development and NODE_ENV=test', () => {
    expect(() => assertLocalDemoTarget({ ...local('127.0.0.1'), NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertLocalDemoTarget({ ...local('127.0.0.1'), NODE_ENV: 'test' })).not.toThrow();
  });
});

describe('assertLocalDemoTarget — the database host', () => {
  for (const host of ['localhost', '127.0.0.1', 'host.docker.internal', 'postgres']) {
    it(`permits ${host}`, () => {
      expect(() => assertLocalDemoTarget(local(host))).not.toThrow();
    });
  }

  it('permits an IPv6 loopback in brackets', () => {
    expect(() =>
      assertLocalDemoTarget({
        DATABASE_URL_MIGRATION: 'postgresql://lc_migration:pw@[::1]:5455/legalconnect',
      }),
    ).not.toThrow();
  });

  for (const host of ['db.prod.internal', '10.0.0.5', 'lc.abc123.mx-central-1.rds.amazonaws.com']) {
    it(`refuses ${host}, whatever NODE_ENV says`, () => {
      expect(() => assertLocalDemoTarget(local(host))).toThrow(DemoSeedRefused);
      expect(() => assertLocalDemoTarget({ ...local(host), NODE_ENV: 'development' })).toThrow(
        DemoSeedRefused,
      );
    });
  }

  it('refuses a host that merely CONTAINS an allowed name', () => {
    // `localhost.attacker.example` and `notlocalhost` must not pass a substring test.
    expect(() => assertLocalDemoTarget(local('localhost.attacker.example'))).toThrow(DemoSeedRefused);
    expect(() => assertLocalDemoTarget(local('notlocalhost'))).toThrow(DemoSeedRefused);
  });

  it('refuses an absent connection string', () => {
    expect(() => assertLocalDemoTarget({})).toThrow(DemoSeedRefused);
  });

  it('refuses an unparseable connection string', () => {
    expect(() => assertLocalDemoTarget({ DATABASE_URL_MIGRATION: 'not a url' })).toThrow(
      DemoSeedRefused,
    );
  });
});

describe('the refusal itself', () => {
  it('never puts the connection string in the message (Principle VI, FR-020)', () => {
    const url = 'postgresql://lc_migration:s3cr3t-password@db.prod.internal:5432/legalconnect';
    let message = '';
    try {
      assertLocalDemoTarget({ DATABASE_URL_MIGRATION: url });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain(url);
    expect(message).not.toContain('s3cr3t-password');
    expect(message).not.toContain('postgresql://');
    // It must still be actionable: the offending host, and what a local setup looks like.
    expect(message).toContain('db.prod.internal');
    expect(message).toContain('localhost');
  });

  it('names the environment rather than the host when NODE_ENV is what refused', () => {
    let message = '';
    try {
      assertLocalDemoTarget({ ...local('localhost'), NODE_ENV: 'production' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('production');
  });
});

describe('there is no override, and that is the point', () => {
  /**
   * FR-012 and the constitution's own reasoning about MFA: "a mechanism whose only
   * purpose is to switch this off must not exist to be misused, misconfigured or wrongly
   * defaulted." A source-text assertion rather than a behavioural one, because the
   * requirement is about what CANNOT be written, and a behavioural test can only probe
   * the escapes somebody already thought of.
   */
  const source = readFileSync(join(__dirname, '..', '..', 'drizzle', 'demo', 'guard.ts'), 'utf8');

  /**
   * Comments and message strings are stripped before scanning, and that is not a loophole
   * — it is the difference between an escape hatch and a sentence explaining that there
   * isn't one. The guard's own message ends "There is deliberately no override", which a
   * naive scan flags as a violation of the very rule it states. Code is what is asserted
   * against; prose is evidence for the reader.
   */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");

  it('takes exactly one argument — no force, allow or skip parameter', () => {
    expect(assertLocalDemoTarget.length).toBeLessThanOrEqual(1);
    expect(code).not.toMatch(/\b(force|allowRemote|skipGuard|override)\b/i);
  });

  it('consults no environment variable that could switch a check off', () => {
    expect(code).not.toMatch(/(ALLOW|SKIP|FORCE|DISABLE)[_A-Z]*(DEMO|SEED|GUARD)/);
    expect(code).not.toMatch(/(DEMO|SEED|GUARD)[_A-Z]*(ALLOW|SKIP|FORCE|DISABLE)/);
    // `env.` reads are the realistic shape of an escape, so no key outside these two may
    // be read. A SUBSET rather than an equality: the NODE_ENV *decision* is delegated to
    // `isDeployedEnvironment`, and this file touches `env.NODE_ENV` only to name it in the
    // refusal. Asserting equality would force the guard to read a variable it does not need.
    const envReads = [...code.matchAll(/env\.([A-Z_]+)/g)].map((m) => m[1]);
    for (const key of envReads) {
      expect(['NODE_ENV', 'DATABASE_URL_MIGRATION']).toContain(key);
    }
  });
});
