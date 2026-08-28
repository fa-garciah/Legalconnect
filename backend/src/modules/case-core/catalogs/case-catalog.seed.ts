/**
 * T027 — the three default case catalogs, and the one insert that writes them.
 *
 * 006/FR-019, FR-021, research.md D7. Mirrors
 * `src/modules/directory/position-catalog.seed.ts` exactly in shape, and for the same
 * reason: two callers share this module rather than each carrying their own copy of the
 * lists —
 *
 *   - `ProvisionService` (001), for a tenant created through
 *     `POST /internal/platform/tenants` — the production path;
 *   - `drizzle/seed.ts`, for the tenants the dev/CI seed creates.
 *
 * 017 learned this the hard way: its two lists were separate at first, which meant the dev
 * seed and the real provisioning path could drift while every test went on passing against
 * the wrong copy.
 *
 * **This is not a "shared constant read at request time."** 017's research.md D2 rejects
 * that, because a constant consulted as a fallback for a tenant with no rows makes
 * "retired everything" and "never seeded" indistinguishable, and could resurrect a catalog
 * a firm deliberately emptied. These constants are read exactly once per tenant, at
 * provisioning, and what they produce is ordinary rows the firm owns outright and may
 * rename or retire on day one. Nothing reads them afterwards.
 */
import { sql } from 'drizzle-orm';
import type { PlatformTx } from '../../../common/db/platform-context';

/**
 * The three statuses `US07-EP02-CSM-MonitorCaseStatus` names, which is why they are these
 * three and not this product's opinion of how a matter progresses.
 *
 * `isClosing` on *Concluido* means a firm that changes nothing still gets correct closing
 * dates from day one (FR-008a, SC-008b). It is a starting convenience like every other
 * seed value, and it is editable — unlike the names, which are retire-and-recreate.
 */
export const DEFAULT_CASE_STATUSES: readonly { readonly name: string; readonly isClosing: boolean }[] = [
  { name: 'En Proceso', isClosing: false },
  { name: 'En Espera', isClosing: false },
  { name: 'Concluido', isClosing: true },
];

/**
 * Firm-agnostic by requirement (FR-019, Principle III). The six broad areas of Mexican
 * practice, not a taxonomy — a boutique amparo firm retires five of these on day one and
 * that is the expected use, not a misuse.
 */
export const DEFAULT_MATTER_TYPES: readonly string[] = [
  'Civil',
  'Mercantil',
  'Laboral',
  'Familiar',
  'Penal',
  'Amparo',
];

/**
 * **Deliberately empty**, and this is the one seed decision worth defending (research.md
 * D7). Case status and matter type are near-universal across Mexican practice. Courts are
 * not: a firm's venues depend on its jurisdiction and its caseload, and any list this
 * product shipped would be wrong for most firms *and* a statement about where they
 * practise. `venue` is optional on a case (FR-005), so a firm opens matters from day one
 * without touching it.
 *
 * Exported as an empty array rather than omitted, so the intent is visible and a future
 * reader finds a decision rather than an oversight.
 */
export const DEFAULT_VENUES: readonly string[] = [];

/**
 * Writes all three default catalogs for one freshly created tenant, on the CALLER's own
 * transaction — so a provisioning that fails partway leaves no catalog behind, by the same
 * enclosing transaction that already guarantees it leaves no tenant behind (001's
 * `ProvisionService`, US3 scenario 5).
 *
 * Deliberately no `RETURNING` and no `ON CONFLICT`: `lc_platform` holds INSERT and nothing
 * else on all three tables (`backend/drizzle/0024`), and both of those clauses would need
 * a SELECT privilege that role must not have. Neither is needed — the tenant was created
 * moments ago in this same transaction, so it has no catalog to conflict with.
 */
export async function seedDefaultCaseCatalogs(tx: PlatformTx, tenantId: string): Promise<void> {
  for (const status of DEFAULT_CASE_STATUSES) {
    await tx.execute(sql`
      INSERT INTO case_status (tenant_id, name, is_closing)
      VALUES (${tenantId}::uuid, ${status.name}, ${status.isClosing})
    `);
  }

  for (const name of DEFAULT_MATTER_TYPES) {
    await tx.execute(sql`
      INSERT INTO matter_type (tenant_id, name) VALUES (${tenantId}::uuid, ${name})
    `);
  }

  // Runs zero times today. Kept as a loop rather than deleted so that a firm-agnostic
  // default, if one is ever found, is a one-line change to the constant above rather than
  // a rediscovery of where seeding happens.
  for (const name of DEFAULT_VENUES) {
    await tx.execute(sql`
      INSERT INTO venue (tenant_id, name) VALUES (${tenantId}::uuid, ${name})
    `);
  }
}
