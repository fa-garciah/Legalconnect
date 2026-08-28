/**
 * T035 — the default position catalog, and the one insert that writes it.
 *
 * 017/FR-009, research.md D2. Two callers, deliberately sharing this module rather
 * than each carrying their own copy of the list:
 *
 *   - `ProvisionService` (001), for a tenant created through
 *     `POST /internal/platform/tenants` — the production path;
 *   - `drizzle/seed.ts`, for the tenants the dev/CI seed creates.
 *
 * They were two separate lists before, and that is exactly the drift this module
 * exists to make impossible: `tests/integration/directory-seed.test.ts` would have
 * gone on passing against the dev seed's copy while a real firm was provisioned from
 * a different one.
 *
 * **This is not the "shared constant" research.md D2 rejects.** D2 rejects a constant
 * read back at REQUEST time as a fallback for a tenant with no rows — which would make
 * "retired everything" and "never seeded" indistinguishable, and could resurrect a
 * catalog a firm deliberately emptied. This constant is read exactly once per tenant,
 * at provisioning, and what it produces is five ordinary rows the firm owns outright
 * and may rename or retire on day one. Nothing reads it afterwards.
 */
import { sql } from 'drizzle-orm';
import type { PlatformTx } from '../../common/db/platform-context';

/**
 * Firm-agnostic by requirement (FR-009, Principle III): a starting convenience, never
 * this product's opinion of how a law firm is organised. Every entry is editable the
 * moment it exists.
 */
export const DEFAULT_POSITION_CATALOG = [
  'Socio',
  'Asociado Senior',
  'Asociado',
  'Pasante',
  'Paralegal',
] as const;

/**
 * Writes the default catalog for one freshly created tenant, on the caller's own
 * transaction — so a provisioning that fails partway leaves no catalog behind, by the
 * same enclosing transaction that already guarantees it leaves no tenant behind
 * (001's ProvisionService, US3 scenario 5).
 *
 * Deliberately no `RETURNING` and no `ON CONFLICT`: `lc_platform` holds INSERT and
 * nothing else on `position` (`backend/drizzle/0022`), and both of those clauses would
 * need a SELECT privilege this role must not have. Neither is needed — the tenant was
 * created moments ago in this same transaction, so it has no catalog to conflict with.
 */
export async function seedDefaultPositionCatalog(
  tx: PlatformTx,
  tenantId: string,
): Promise<void> {
  for (const name of DEFAULT_POSITION_CATALOG) {
    await tx.execute(sql`
      INSERT INTO position (tenant_id, name) VALUES (${tenantId}::uuid, ${name})
    `);
  }
}
