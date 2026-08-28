/**
 * T009 — research.md D6. `buildObjectKey` is the one place object keys are
 * constructed; every guarantee downstream (a key alone cannot be guessed into a
 * cross-tenant path) depends on its three inputs actually being opaque UUIDs, not
 * caller-influenced strings that could smuggle a path segment.
 */
import { describe, expect, it } from 'vitest';
import { buildObjectKey } from '../../src/common/storage/object-store/object-store.port';

const TENANT = '11111111-1111-4111-8111-111111111111';
const CASE = '22222222-2222-4222-8222-222222222222';
const DOCUMENT = '33333333-3333-4333-8333-333333333333';

describe('buildObjectKey (research.md D6)', () => {
  it('produces tenant/{tenantId}/case/{caseId}/{documentId}', () => {
    expect(buildObjectKey(TENANT, CASE, DOCUMENT)).toBe(`tenant/${TENANT}/case/${CASE}/${DOCUMENT}`);
  });

  it('rejects a tenantId that is not a well-formed UUID', () => {
    expect(() => buildObjectKey('../other-tenant', CASE, DOCUMENT)).toThrow();
  });

  it('rejects a caseId that is not a well-formed UUID', () => {
    expect(() => buildObjectKey(TENANT, '../../other-tenant/case/x', DOCUMENT)).toThrow();
  });

  it('rejects a documentId that is not a well-formed UUID', () => {
    expect(() => buildObjectKey(TENANT, CASE, '../x')).toThrow();
  });
});
