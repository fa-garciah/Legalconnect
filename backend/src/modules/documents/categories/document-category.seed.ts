/**
 * T016 — the default document-category catalog, and the one insert that writes it.
 *
 * 007/FR-009, research.md D1. Two callers, deliberately sharing this module rather
 * than each carrying their own copy of the list — the same shape 017's
 * `position-catalog.seed.ts` and 006's `case-catalog.seed.ts` already established:
 *
 *   - `ProvisionService` (001), for a tenant created through
 *     `POST /internal/platform/tenants` — the production path;
 *   - `drizzle/seed.ts`, for the tenants the dev/CI seed creates.
 *
 * This is not the "shared constant" research.md D1 (via 017's D2) rejects — this
 * constant is read exactly once per tenant, at provisioning, and what it produces is
 * ordinary rows the firm owns outright and may rename or retire on day one.
 */
import { sql } from 'drizzle-orm';
import type { PlatformTx } from '../../../common/db/platform-context';

/**
 * Firm-agnostic (FR-009, Principle III), including "Unclassified" — the entry an
 * upload naming no category resolves to (FR-010). Every entry is editable the moment
 * it exists.
 */
export const DEFAULT_DOCUMENT_CATEGORIES = [
  'Contrato',
  'Correspondencia',
  'Evidencia',
  'Unclassified',
] as const;

/**
 * Writes the default catalog for one freshly created tenant, on the caller's own
 * transaction — so a provisioning that fails partway leaves no catalog behind, by the
 * same enclosing transaction 001's `ProvisionService` already guarantees leaves no
 * tenant behind (US3 scenario 5).
 *
 * Deliberately no `RETURNING` and no `ON CONFLICT`: `lc_platform` holds INSERT and
 * nothing else on `document_category` (`backend/drizzle/0028`), and both clauses
 * would need a SELECT privilege this role must not have. Neither is needed — the
 * tenant was created moments ago in this same transaction, so it has no catalog to
 * conflict with.
 */
export async function seedDefaultDocumentCategories(tx: PlatformTx, tenantId: string): Promise<void> {
  for (const name of DEFAULT_DOCUMENT_CATEGORIES) {
    await tx.execute(sql`
      INSERT INTO document_category (tenant_id, name) VALUES (${tenantId}::uuid, ${name})
    `);
  }
}
