/**
 * T002 — research.md D6. The only interface any module besides this one's own
 * implementation may depend on. No file outside `common/storage/object-store/` may
 * import `@aws-sdk/*` directly (verified by T049) — that is what makes this the single
 * chokepoint Principle II's "one seam, not one check per endpoint" requires for a
 * storage layer RLS cannot reach.
 */
export interface PutObjectInput {
  readonly key: string;
  readonly body: Buffer;
  readonly contentType: string;
}

export interface PresignedUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

export interface ObjectStorePort {
  put(input: PutObjectInput): Promise<void>;
  /** Single-object, time-limited (research.md D6) — never a bucket-wide credential. */
  presignGet(key: string): Promise<PresignedUrl>;
  /** Used only for upload-failure rollback (research.md D4) — never a user-facing delete. */
  delete(key: string): Promise<void>;
}

export const OBJECT_STORE_PORT = Symbol('OBJECT_STORE_PORT');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * research.md D6 — tenant/case/document namespacing. A key alone cannot be guessed
 * into a cross-tenant path without already knowing another tenant's UUID, and even
 * then resolves to nothing without a valid signed credential for it.
 *
 * Each of the three segments MUST be a well-formed UUID — never interpolated as an
 * arbitrary string. Without this, a value containing `/` or `..` could smuggle an
 * extra path segment into the key, letting a caller influence which "directory" an
 * object lands in rather than only which opaque id names it.
 */
export function buildObjectKey(tenantId: string, caseId: string, documentId: string): string {
  for (const [name, value] of [
    ['tenantId', tenantId],
    ['caseId', caseId],
    ['documentId', documentId],
  ] as const) {
    if (!UUID.test(value)) throw new Error(`buildObjectKey: ${name} is not a well-formed UUID`);
  }
  return `tenant/${tenantId}/case/${caseId}/${documentId}`;
}
