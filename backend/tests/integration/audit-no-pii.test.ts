/**
 * T057 / quickstart V14 / FR-012 / SC-006 — no entry contains end-client personal
 * data, secrets or authentication factors.
 *
 * This is the one rule in the data model a constraint cannot express, so the test is
 * the real control. The sanitiser REFUSES rather than strips: an entry retained 24
 * months and readable by the firm is the wrong place to discover that redaction missed
 * a field, and FR-017 means refusing also rolls back the mutation — which is the
 * correct outcome for an operation that cannot be audited safely.
 */
import { describe, expect, it } from 'vitest';
import { assertNoSensitiveData, SensitiveDataInAudit } from '../../src/common/audit/sanitise';

describe('audit metadata sanitiser', () => {
  it('accepts ordinary operational metadata', () => {
    expect(() =>
      assertNoSensitiveData({ from: 'profesional', to: 'premium', limitsChanged: ['users'] }),
    ).not.toThrow();
  });

  it('accepts identifiers, which are references rather than personal data', () => {
    expect(() =>
      assertNoSensitiveData({ tenantId: 'a-uuid', membershipId: 'another-uuid' }),
    ).not.toThrow();
  });

  it.each([
    ['password', { password: 'hunter2' }],
    ['token', { accessToken: 'abc' }],
    ['secret', { clientSecret: 'shh' }],
    ['api key', { apiKey: 'k' }],
    ['TOTP factor', { totpSeed: 'JBSWY3DP' }],
    ['backup codes', { backupCodes: ['1', '2'] }],
    ['CSD private key', { csdPrivateKey: '-----BEGIN' }],
  ])('refuses %s', (_label, metadata) => {
    expect(() => assertNoSensitiveData(metadata)).toThrow(SensitiveDataInAudit);
  });

  it.each([
    ['CURP', { curp: 'GARF900101HDFRNC01' }],
    ['end-client name', { clientName: 'Juan Pérez' }],
    ['email', { contactEmail: 'juan@example.mx' }],
    ['phone', { phone: '+52 55 1234 5678' }],
    ['address', { homeAddress: 'Calle 1' }],
    ['date of birth', { dateOfBirth: '1990-01-01' }],
  ])('refuses %s', (_label, metadata) => {
    expect(() => assertNoSensitiveData(metadata)).toThrow(SensitiveDataInAudit);
  });

  it('inspects nested structures, not just top-level keys', () => {
    expect(() => assertNoSensitiveData({ detail: { nested: { password: 'x' } } })).toThrow(
      SensitiveDataInAudit,
    );
  });

  it('inspects arrays of objects', () => {
    expect(() => assertNoSensitiveData({ items: [{ ok: 1 }, { apiKey: 'x' }] })).toThrow(
      SensitiveDataInAudit,
    );
  });

  it('catches an email-shaped VALUE even under an innocent key', () => {
    // The key deny-list only catches what it was told to look for. Values that look
    // like contact details are caught regardless of what they are called.
    expect(() => assertNoSensitiveData({ note: 'reach me at juan@example.mx' })).toThrow(
      SensitiveDataInAudit,
    );
  });

  it('catches a JWT-shaped value', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln';
    expect(() => assertNoSensitiveData({ note: jwt })).toThrow(SensitiveDataInAudit);
  });

  it('names the offending path so the failure is actionable', () => {
    try {
      assertNoSensitiveData({ detail: { clientSecret: 'x' } });
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as Error).message).toContain('detail.clientSecret');
    }
  });

  it('does not choke on null, undefined or empty metadata', () => {
    expect(() => assertNoSensitiveData({})).not.toThrow();
    expect(() => assertNoSensitiveData({ a: null, b: undefined })).not.toThrow();
  });

  it.each(['addresscount', 'emailsent', 'tokenCount'])(
    'accepts %s — it contains a forbidden substring but is a reference, not data',
    (key) => {
      expect(() => assertNoSensitiveData({ [key]: 3 })).not.toThrow();
    },
  );

  it('stops descending past a bounded depth rather than recursing without limit', () => {
    // 13 levels — one past the walk's own limit. A malicious or accidental cycle-free
    // but very deep structure must not make this scan unbounded.
    let deep: unknown = { password: 'buried' };
    for (let i = 0; i < 13; i += 1) deep = { nested: deep };
    expect(() => assertNoSensitiveData(deep as Record<string, unknown>)).not.toThrow();
  });

  // Regression guard. The first phone shape matched any run of ten or more digits, so
  // a timestamp or a byte count refused the write — and because the sanitiser refuses
  // rather than strips, that rolled back the mutation too. An over-broad value shape
  // is a denial of service on our own writes, not a harmless false positive.
  it.each([
    ['a millisecond timestamp', { marker: 'ts-1755678901234' }],
    ['a byte count', { storageBytes: 107374182400 }],
    ['a byte count as text', { storageBytes: '107374182400' }],
    ['a long numeric id', { externalRef: '9876543210987' }],
    ['a UUID', { tenantId: '3a4aa63d-1d4d-477e-8216-cfdde1752b54' }],
    ['an RFC', { rfc: 'DAL091203AB1' }],
  ])('accepts %s', (_label, metadata) => {
    expect(() => assertNoSensitiveData(metadata)).not.toThrow();
  });

  it('still catches a genuinely phone-shaped value', () => {
    expect(() => assertNoSensitiveData({ note: '55 1234 5678' })).toThrow(SensitiveDataInAudit);
    expect(() => assertNoSensitiveData({ note: '+52 55 1234 5678' })).toThrow(SensitiveDataInAudit);
    expect(() => assertNoSensitiveData({ note: '(55) 1234-5678' })).toThrow(SensitiveDataInAudit);
  });
});
