/**
 * T006 — a UUID derived from what the row *is*, rather than drawn when it is written.
 * 022/FR-014, Decision 5.
 *
 * Every other demo table has a natural key to be idempotent on: a tenant has its RFC, a
 * matter its file number, a client its legal name. A document has neither — its only unique
 * column is `storage_key`, and that key is built from the document's own id
 * (`buildObjectKey(tenantId, caseId, documentId)`). With a database-generated id the key is
 * different on every run, so `ON CONFLICT (storage_key) DO NOTHING` never fires, a second
 * row is written, and a second object lands in the bucket — which nothing in the product can
 * delete, because there is no user-facing delete on the object store by design.
 *
 * So the id is derived from the parts that identify the document to a human: the firm, the
 * matter, and its position within that matter.
 *
 * This is UUIDv5's construction (SHA-1 of a namespace and a name) with SHA-256 in place of
 * SHA-1 — the version and variant bits are set the same way, so the result is a well-formed
 * UUID that `buildObjectKey`'s regex accepts and Postgres stores as a `uuid`. It is NOT a
 * standards-conformant v5 and does not claim to be; it needs to be stable and well-shaped,
 * not interoperable with another implementation.
 */
import { createHash } from 'node:crypto';

/**
 * Namespaced so two different kinds of row can never derive the same id from the same
 * parts — `deterministicUuid('case', rfc, 'EXP-2026-0001')` and
 * `deterministicUuid('document', rfc, 'EXP-2026-0001')` are different ids.
 */
export function deterministicUuid(kind: string, ...parts: readonly string[]): string {
  const hash = createHash('sha256').update(['legalconnect-demo', kind, ...parts].join('\u0000')).digest();

  const bytes = Buffer.from(hash.subarray(0, 16));
  // Version 5 in the high nibble of byte 6, RFC 4122 variant in the top bits of byte 8.
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
