/**
 * T005 — stable ids, so a re-run writes nothing. 022/FR-014, Decision 5.
 *
 * THE FAILURE THIS PREVENTS is specific and expensive. A document's `storage_key` is
 * `buildObjectKey(tenantId, caseId, documentId)`, and `document.storage_key` is the unique
 * column the seed's `ON CONFLICT DO NOTHING` relies on. With a database-generated id, every
 * run produces a new id, therefore a new key, therefore a new row AND a new object — and
 * the object store has no user-facing delete (`object-store.port.ts:27`), so the bucket
 * fills up with orphans nobody can remove through the product.
 */
import { describe, expect, it } from 'vitest';
import { buildObjectKey } from '../../src/common/storage/object-store/object-store.port';
import { deterministicUuid } from '../../drizzle/demo/deterministic-id';

describe('deterministicUuid', () => {
  it('returns the same uuid for the same parts', () => {
    expect(deterministicUuid('document', 'DME260101AB1', 'EXP-2026-0001', '3')).toBe(
      deterministicUuid('document', 'DME260101AB1', 'EXP-2026-0001', '3'),
    );
  });

  it('returns a different uuid when any part differs', () => {
    const base = deterministicUuid('document', 'DME260101AB1', 'EXP-2026-0001', '3');
    expect(deterministicUuid('document', 'DME260101AB1', 'EXP-2026-0001', '4')).not.toBe(base);
    expect(deterministicUuid('document', 'DME260101AB1', 'EXP-2026-0002', '3')).not.toBe(base);
    expect(deterministicUuid('document', 'BRC260101CD2', 'EXP-2026-0001', '3')).not.toBe(base);
    expect(deterministicUuid('case', 'DME260101AB1', 'EXP-2026-0001', '3')).not.toBe(base);
  });

  it('does not collide across a realistic number of documents', () => {
    const ids = new Set<string>();
    for (let matter = 0; matter < 45; matter += 1) {
      for (let index = 0; index < 12; index += 1) {
        ids.add(deterministicUuid('document', 'DME260101AB1', `EXP-2026-${matter}`, String(index)));
      }
    }
    expect(ids.size).toBe(45 * 12);
  });

  /**
   * The shape matters as much as the stability: `buildObjectKey` validates all three
   * segments against a UUID regex and throws otherwise, so an id that is merely "unique"
   * but not well-formed fails at the storage seam rather than here.
   */
  it('is accepted by buildObjectKey', () => {
    const tenantId = deterministicUuid('tenant', 'DME260101AB1');
    const caseId = deterministicUuid('case', 'DME260101AB1', 'EXP-2026-0001');
    const documentId = deterministicUuid('document', 'DME260101AB1', 'EXP-2026-0001', '3');
    expect(() => buildObjectKey(tenantId, caseId, documentId)).not.toThrow();
    expect(buildObjectKey(tenantId, caseId, documentId)).toBe(
      `tenant/${tenantId}/case/${caseId}/${documentId}`,
    );
  });

  it('carries RFC 4122 version and variant bits', () => {
    const id = deterministicUuid('document', 'x', 'y');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
