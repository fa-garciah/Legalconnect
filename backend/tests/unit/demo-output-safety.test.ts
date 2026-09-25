/**
 * T014a — the printed table carries what a human needs and nothing Principle VI forbids.
 * 022/FR-018, FR-020. Gap found by `/speckit-analyze`.
 *
 * `demo-guard.test.ts` already checks that a REFUSAL leaks no connection string. This checks
 * the success path, which is the output that actually exists next to a digest: the command
 * has just written seven Argon2id digests and seven wrapped TOTP secrets, and it is about to
 * print a table.
 */
import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, DEMO_PEOPLE, totpSecretFor } from '../../drizzle/demo/firm';
import { credentialLines, renderBackupCodes, renderCredentialTable } from '../../drizzle/demo/report';

const table = renderCredentialTable();

describe('what the table must contain (FR-018)', () => {
  it('names every demo person\'s email', () => {
    for (const person of DEMO_PEOPLE) expect(table).toContain(person.email);
  });

  it('prints the shared password once', () => {
    expect(table).toContain(DEMO_PASSWORD);
  });

  it('prints each person\'s TOTP secret', () => {
    for (const person of DEMO_PEOPLE) expect(table).toContain(totpSecretFor(person.slug));
  });

  it('says where the backup codes are written down', () => {
    expect(table).toContain('quickstart.md');
  });

  it('mentions the person who holds two memberships', () => {
    const dual = DEMO_PEOPLE.find((p) => p.alsoAt !== undefined)!;
    expect(table).toContain(dual.email);
    expect(table).toContain(dual.alsoAt!.firmRfc);
  });

  it('is in Spanish, like everything a person reads', () => {
    expect(table).not.toMatch(/\b(the|and|password|secret|shared|email|backup)\b/i);
  });
});

describe('what the table must never contain (FR-020, Principle VI)', () => {
  const everything = [table, ...DEMO_PEOPLE.map((p) => renderBackupCodes(p.slug))].join('\n');

  it('carries no Argon2id digest', () => {
    expect(everything).not.toContain('$argon2');
  });

  it('carries no connection string', () => {
    expect(everything).not.toContain('postgres://');
    expect(everything).not.toContain('postgresql://');
  });

  it('carries no key reference or ciphertext marker', () => {
    expect(everything).not.toContain('key_reference');
    expect(everything).not.toContain('secret_ciphertext');
    expect(everything).not.toContain('local:env');
  });

  it('carries no database role password from .env', () => {
    for (const secret of ['lc_migration_dev', 'lc_app_dev', 'lc_auth_dev', 'lc_minio_dev_password']) {
      expect(everything).not.toContain(secret);
    }
  });

  it('carries no AUTH_LOCAL_KEY material', () => {
    expect(everything).not.toContain('AUTH_LOCAL_KEY');
  });
});

describe('credentialLines', () => {
  it('describes all seven people', () => {
    expect(credentialLines()).toHaveLength(7);
  });

  it('is derived, so two runs print the same thing (FR-014)', () => {
    expect(renderCredentialTable()).toBe(renderCredentialTable());
  });
});
