/**
 * T012, T019, T024, T030 — what `npm run db:seed:demo` actually leaves in the database.
 * 022/FR-002 … FR-014.
 *
 * THIS TEST RUNS THE REAL COMMAND, once, as a child process. That is deliberate rather than
 * convenient: the deliverable of this slice IS the command, and a test that called its
 * internal writers directly would pass while the entry point was broken — which is precisely
 * the class of defect the slice exists to fix (`seed.ts` writes rows that look fine and
 * produce an identity nobody can authenticate as).
 *
 * The command refuses to run anywhere but a local database (`demo/guard.ts`), so this test can
 * only ever touch one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { verifyCredential, verifyHighEntropy } from '../../src/common/auth/argon2';
import { resolveKeyProvider } from '../../src/common/auth/key-provider';
import { verifyCode } from '../../src/common/auth/totp';
import {
  DEMO_FIRMS,
  DEMO_PASSWORD,
  DEMO_PEOPLE,
  backupCodesFor,
  totpSecretFor,
} from '../../drizzle/demo/firm';

const backendRoot = join(__dirname, '..', '..');
const DEMO_RFCS = DEMO_FIRMS.map((f) => f.rfc);

/**
 * Runs the command. A non-zero exit is TOLERATED and inspected rather than thrown, because
 * FR-016 makes "the object store was unreachable" a non-zero exit with every row still
 * written — the state of this machine, where `quay.io` refuses the MinIO image. The database
 * assertions below must hold in both cases; only the object assertions are conditional.
 */
function runDemoSeed(): { readonly stdout: string; readonly code: number } {
  try {
    const stdout = execFileSync('npx', ['tsx', 'drizzle/seed-demo.ts'], {
      cwd: backendRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 180_000,
    });
    return { stdout, code: 0 };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { stdout: `${failure.stdout ?? ''}${failure.stderr ?? ''}`, code: failure.status ?? 1 };
  }
}

describe('the demo firm seed', () => {
  let migration: Client;
  let firstRun: { readonly stdout: string; readonly code: number };

  beforeAll(async () => {
    migration = await connectAs('migration');
    firstRun = runDemoSeed();
  }, 240_000);

  afterAll(async () => {
    await migration.end();
  });

  async function one<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
    const { rows } = await migration.query<T>(sql, params);
    return rows[0] as T;
  }

  it('creates both firms with the plan each was given', async () => {
    const { rows } = await migration.query<{ rfc: string; code: string }>(
      `SELECT t.rfc, p.code::text AS code FROM tenant t JOIN plan p ON p.id = t.plan_id
        WHERE t.rfc = ANY($1::text[]) ORDER BY t.rfc`,
      [DEMO_RFCS],
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.code)).toEqual(['esencial', 'profesional']);
  });

  describe('every demo person can actually authenticate (FR-002, FR-003, FR-004)', () => {
    it('has a credential digest that verifies against the printed password', async () => {
      for (const person of DEMO_PEOPLE) {
        const row = await one<{ digest: string }>(
          `SELECT c.digest FROM identity_credential c JOIN identity i ON i.id = c.identity_id
            WHERE i.email = $1`,
          [person.email],
        );
        expect(row, person.email).toBeDefined();
        await expect(verifyCredential(row.digest, DEMO_PASSWORD)).resolves.toBe(true);
        await expect(verifyCredential(row.digest, 'not-the-password')).resolves.toBe(false);
      }
    });

    it('has a confirmed factor whose secret unwraps to the printed one', async () => {
      const provider = resolveKeyProvider();
      for (const person of DEMO_PEOPLE) {
        const row = await one<{
          secret_ciphertext: Buffer;
          key_reference: string;
          confirmed_at: Date | null;
        }>(
          `SELECT f.secret_ciphertext, f.key_reference, f.confirmed_at
             FROM identity_factor f JOIN identity i ON i.id = f.identity_id
            WHERE i.email = $1`,
          [person.email],
        );
        expect(row, person.email).toBeDefined();
        expect(row.confirmed_at).not.toBeNull();
        const secret = await provider.unwrap(row.key_reference, Buffer.from(row.secret_ciphertext));
        expect(secret.toString('utf8')).toBe(totpSecretFor(person.slug));
      }
    });

    it('never stores the TOTP secret in a form a dump would reveal', async () => {
      // Constitution, custody of TOTP secrets: "a database dump… MUST NOT be sufficient to
      // derive a working second factor."
      for (const person of DEMO_PEOPLE) {
        const row = await one<{ blob: string }>(
          `SELECT encode(f.secret_ciphertext, 'escape') AS blob
             FROM identity_factor f JOIN identity i ON i.id = f.identity_id WHERE i.email = $1`,
          [person.email],
        );
        expect(row.blob).not.toContain(totpSecretFor(person.slug));
      }
    });

    it('keeps confirmed_at and mfa_enrolled_at in agreement (FR-004)', async () => {
      const { rows } = await migration.query<{ email: string; enrolled: boolean; confirmed: boolean }>(
        `SELECT i.email,
                (i.mfa_enrolled_at IS NOT NULL) AS enrolled,
                (f.confirmed_at IS NOT NULL) AS confirmed
           FROM identity i LEFT JOIN identity_factor f ON f.identity_id = i.id
          WHERE i.subject LIKE 'demo|%'`,
      );
      expect(rows).toHaveLength(DEMO_PEOPLE.length);
      for (const row of rows) expect(row.enrolled, row.email).toBe(row.confirmed);
    });

    it('has exactly ten backup codes in one set, and they verify', async () => {
      for (const person of DEMO_PEOPLE) {
        const { rows } = await migration.query<{ set_id: string; digest: string }>(
          `SELECT b.set_id, b.digest FROM backup_code b JOIN identity i ON i.id = b.identity_id
            WHERE i.email = $1 AND b.consumed_at IS NULL`,
          [person.email],
        );
        expect(rows, person.email).toHaveLength(10);
        expect(new Set(rows.map((r) => r.set_id)).size).toBe(1);
        const expected = backupCodesFor(person.slug);
        // One spot check per person: the first printed code matches one stored digest.
        const matches = await Promise.all(
          rows.map((r) => verifyHighEntropy(r.digest, expected[0] as string)),
        );
        expect(matches.filter(Boolean)).toHaveLength(1);
      }
    });

    it('produces a TOTP code the product accepts, from the stored secret', async () => {
      const provider = resolveKeyProvider();
      const row = await one<{ secret_ciphertext: Buffer; key_reference: string }>(
        `SELECT f.secret_ciphertext, f.key_reference FROM identity_factor f
           JOIN identity i ON i.id = f.identity_id WHERE i.email = $1`,
        [DEMO_PEOPLE[0]!.email],
      );
      const secret = (await provider.unwrap(row.key_reference, Buffer.from(row.secret_ciphertext))).toString('utf8');
      const now = Math.floor(Date.now() / 1000);
      const { generateAt } = await import('../../src/common/auth/totp');
      await expect(verifyCode(secret, await generateAt(secret, now), now)).resolves.toBe(true);
    });
  });

  it('covers every internal archetype with a live membership and a position (FR-001)', async () => {
    const { rows } = await migration.query<{ archetype: string; position: string | null }>(
      `SELECT m.archetype::text AS archetype, p.name AS position
         FROM membership m
         JOIN identity i ON i.id = m.identity_id
         LEFT JOIN directory_entry d ON d.membership_id = m.id
         LEFT JOIN position p ON p.id = d.position_id
        WHERE i.subject LIKE 'demo|%' AND m.tenant_id = (SELECT id FROM tenant WHERE rfc = $1)`,
      [DEMO_FIRMS[0]!.rfc],
    );
    expect(rows.map((r) => r.archetype).sort()).toEqual(['AA', 'AA', 'BM', 'CM', 'MP', 'PL', 'SA']);
    for (const row of rows) expect(row.position, row.archetype).not.toBeNull();
  });

  it('gives one person a membership in both firms, with different archetypes (001/FR-021)', async () => {
    const dual = DEMO_PEOPLE.find((p) => p.alsoAt !== undefined)!;
    const { rows } = await migration.query<{ rfc: string; archetype: string }>(
      `SELECT t.rfc, m.archetype::text AS archetype
         FROM membership m JOIN identity i ON i.id = m.identity_id JOIN tenant t ON t.id = m.tenant_id
        WHERE i.email = $1 ORDER BY t.rfc`,
      [dual.email],
    );
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.archetype)).size).toBe(2);
  });

  describe('matters (FR-006, FR-007)', () => {
    it('sets closed_on exactly where the status closes the matter', async () => {
      const { rows } = await migration.query<{ mismatched: string }>(
        `SELECT count(*)::text AS mismatched
           FROM case_file cf JOIN case_status cs ON cs.id = cf.case_status_id
          WHERE cf.tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[]))
            AND ((cs.is_closing AND cf.closed_on IS NULL) OR (NOT cs.is_closing AND cf.closed_on IS NOT NULL))`,
        [DEMO_RFCS],
      );
      expect(Number(rows[0]!.mismatched)).toBe(0);
    });

    it('closes them after they opened, so a resolution time is positive', async () => {
      const { rows } = await migration.query<{ bad: string }>(
        `SELECT count(*)::text AS bad FROM case_file
          WHERE tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[]))
            AND closed_on IS NOT NULL AND closed_on <= opened_on`,
        [DEMO_RFCS],
      );
      expect(Number(rows[0]!.bad)).toBe(0);
    });

    it('gives every matter a matter type, which 015 groups by', async () => {
      const { rows } = await migration.query<{ untyped: string }>(
        `SELECT count(*)::text AS untyped FROM case_file
          WHERE tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[])) AND matter_type_id IS NULL`,
        [DEMO_RFCS],
      );
      expect(Number(rows[0]!.untyped)).toBe(0);
    });

    it('loads the two associates unevenly, so a per-attorney chart is not flat', async () => {
      const { rows } = await migration.query<{ email: string; leads: string }>(
        `SELECT i.email, count(*)::text AS leads
           FROM case_assignment a
           JOIN membership m ON m.id = a.membership_id
           JOIN identity i ON i.id = m.identity_id
          WHERE a.role_on_case = 'lead' AND a.unassigned_at IS NULL
            AND m.archetype = 'AA' AND i.subject LIKE 'demo|%'
          GROUP BY i.email`,
      );
      expect(rows.length).toBe(2);
      const counts = rows.map((r) => Number(r.leads));
      expect(Math.abs((counts[0] as number) - (counts[1] as number))).toBeGreaterThanOrEqual(3);
    });

    it('leaves at least one matter with no live assignment at all', async () => {
      const { rows } = await migration.query<{ unstaffed: string }>(
        `SELECT count(*)::text AS unstaffed FROM case_file cf
          WHERE cf.tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[]))
            AND NOT EXISTS (
              SELECT 1 FROM case_assignment a WHERE a.case_id = cf.id AND a.unassigned_at IS NULL)`,
        [DEMO_RFCS],
      );
      expect(Number(rows[0]!.unstaffed)).toBeGreaterThanOrEqual(1);
    });

    /**
     * 015 — the seed must CONVERGE on what the generator says, not accumulate across runs.
     *
     * Found while writing `015`'s results: this database held 33 bars' worth of matters in a
     * firm with 21 active ones. The insert was `ON CONFLICT … DO NOTHING`, so it only ever
     * added — and anything that moves the RNG stream changes a matter's lead, leaving the
     * previous run's lead live beside the new one. The unique index is
     * `(case_id, membership_id) WHERE unassigned_at IS NULL`, so two people being live `lead`
     * on one matter is perfectly legal and the database never complained.
     *
     * `015`'s `loadPerAttorney` counts one row per (matter, lead) pair, so such a matter is
     * counted for both. The idempotency fingerprint above cannot see this — it compares two
     * runs of the SAME generation, and the defect only appears when the generation changes.
     */
    it('gives every matter at most ONE live lead, however often the seed has been re-run', async () => {
      const { rows } = await migration.query<{ multi: string }>(
        `SELECT count(*)::text AS multi FROM (
            SELECT a.case_id
              FROM case_assignment a
              JOIN case_file cf ON cf.id = a.case_id
             WHERE a.role_on_case = 'lead' AND a.unassigned_at IS NULL
               AND cf.tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[]))
             GROUP BY a.case_id HAVING count(*) > 1) x`,
        [DEMO_RFCS],
      );
      expect(Number(rows[0]!.multi)).toBe(0);
    });

    it("015's workload bars sum to exactly the firm's active-matter count", async () => {
      // The property that makes the chart trustworthy, asserted end to end rather than
      // inferred from the one above: each active matter is counted once, for one responsible
      // or for the explicit "nobody" group.
      const row = await one<{ active: string; attributed: string }>(
        `SELECT
            (SELECT count(*)::text FROM case_file cf
               JOIN case_status cs ON cs.id = cf.case_status_id
              WHERE NOT cs.is_closing
                AND cf.tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[]))) AS active,
            (SELECT count(*)::text FROM case_file cf
               JOIN case_status cs ON cs.id = cf.case_status_id
               LEFT JOIN case_assignment a
                      ON a.case_id = cf.id AND a.role_on_case = 'lead' AND a.unassigned_at IS NULL
              WHERE NOT cs.is_closing
                AND cf.tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[]))) AS attributed`,
        [DEMO_RFCS],
      );
      expect(Number(row.attributed)).toBe(Number(row.active));
    });
  });

  describe('documents and the storage counter (FR-008, FR-010)', () => {
    it('writes about 130 documents to the full firm, at least one withdrawn', async () => {
      const row = await one<{ total: string; withdrawn: string }>(
        `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE status = 'withdrawn')::text AS withdrawn
           FROM document WHERE tenant_id = (SELECT id FROM tenant WHERE rfc = $1)`,
        [DEMO_FIRMS[0]!.rfc],
      );
      expect(Number(row.total)).toBe(130);
      expect(Number(row.withdrawn)).toBeGreaterThanOrEqual(1);
    });

    it('keeps the withdrawn timestamp consistent with the status', async () => {
      // `document_withdrawn_at_consistent` would refuse otherwise; asserted so a future
      // change to the seed cannot quietly start relying on the constraint to catch it.
      const row = await one<{ bad: string }>(
        `SELECT count(*)::text AS bad FROM document
          WHERE tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[]))
            AND ((status = 'withdrawn' AND withdrawn_at IS NULL)
                 OR (status = 'active' AND withdrawn_at IS NOT NULL))`,
        [DEMO_RFCS],
      );
      expect(Number(row.bad)).toBe(0);
    });

    it('sets storage_bytes_used to the sum over ALL rows, withdrawn included (FR-010)', async () => {
      for (const rfc of DEMO_RFCS) {
        const row = await one<{ counter: string; actual: string }>(
          `SELECT t.storage_bytes_used::text AS counter,
                  COALESCE((SELECT SUM(size_bytes) FROM document d WHERE d.tenant_id = t.id), 0)::text AS actual
             FROM tenant t WHERE t.rfc = $1`,
          [rfc],
        );
        expect(row.counter, rfc).toBe(row.actual);
        expect(Number(row.counter)).toBeGreaterThan(0);
      }
    });

    it('names every object with a key the production upload path would produce', async () => {
      const { rows } = await migration.query<{ storage_key: string }>(
        `SELECT storage_key FROM document
          WHERE tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[]))`,
        [DEMO_RFCS],
      );
      const shape = /^tenant\/[0-9a-f-]{36}\/case\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;
      for (const row of rows) expect(row.storage_key).toMatch(shape);
    });
  });

  it('writes calendar events that satisfy the one-shape constraint (FR-011)', async () => {
    const row = await one<{ bad: string; types: string }>(
      `SELECT count(*) FILTER (WHERE
                 NOT ((all_day AND starts_on IS NOT NULL AND starts_at IS NULL)
                      OR (NOT all_day AND starts_at IS NOT NULL AND starts_on IS NULL)))::text AS bad,
              count(DISTINCT type)::text AS types
         FROM calendar_event WHERE tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[]))`,
      [DEMO_RFCS],
    );
    expect(Number(row.bad)).toBe(0);
    expect(Number(row.types)).toBeGreaterThanOrEqual(3);
  });

  describe('idempotency (FR-014, SC-003)', () => {
    it('changes nothing on a second run', async () => {
      const snapshot = async (): Promise<string> => {
        const row = await one<{ fingerprint: string }>(
          `SELECT concat_ws('|',
              (SELECT count(*) FROM tenant WHERE rfc = ANY($1::text[])),
              (SELECT count(*) FROM identity WHERE subject LIKE 'demo|%'),
              (SELECT count(*) FROM identity_credential c JOIN identity i ON i.id = c.identity_id WHERE i.subject LIKE 'demo|%'),
              (SELECT count(*) FROM backup_code b JOIN identity i ON i.id = b.identity_id WHERE i.subject LIKE 'demo|%'),
              (SELECT count(*) FROM membership m JOIN identity i ON i.id = m.identity_id WHERE i.subject LIKE 'demo|%'),
              (SELECT count(*) FROM client WHERE tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[]))),
              (SELECT count(*) FROM case_file WHERE tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[]))),
              (SELECT count(*) FROM case_assignment WHERE tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[]))),
              (SELECT count(*) FROM document WHERE tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[]))),
              (SELECT count(*) FROM calendar_event WHERE tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[]))),
              (SELECT coalesce(sum(storage_bytes_used), 0) FROM tenant WHERE rfc = ANY($1::text[]))
            ) AS fingerprint`,
          [DEMO_RFCS],
        );
        return row.fingerprint;
      };

      const before = await snapshot();
      const second = runDemoSeed();
      const after = await snapshot();
      expect(after).toBe(before);
      // And it prints the same credentials, which is what makes the demo returnable-to.
      expect(second.stdout).toContain(DEMO_PASSWORD);
      expect(second.stdout).toContain(totpSecretFor(DEMO_PEOPLE[0]!.slug));
    }, 240_000);
  });

  describe('FR-016 — the object store', () => {
    it('either wrote every object, or exited non-zero naming what it could not write', () => {
      if (firstRun.code === 0) {
        expect(firstRun.stdout).not.toContain('sin bytes');
      } else {
        // The state of this machine on 2026-09-25: quay.io refuses the MinIO image, so the
        // store is unreachable. Rows are written, the failure is named, the exit is non-zero.
        expect(firstRun.stdout).toContain('sin bytes');
        expect(firstRun.code).toBe(1);
      }
    });

    it('wrote the metadata rows either way', async () => {
      const row = await one<{ total: string }>(
        `SELECT count(*)::text AS total FROM document
          WHERE tenant_id IN (SELECT id FROM tenant WHERE rfc = ANY($1::text[]))`,
        [DEMO_RFCS],
      );
      expect(Number(row.total)).toBe(135);
    });
  });
});
