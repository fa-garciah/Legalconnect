/**
 * The authoritative list of tenant-scoped tables.
 *
 * Why a registry rather than "scan for a tenant_id column": the `tenant` table is
 * tenant-scoped but its policy filters on `id`, because the row IS the tenant. A
 * column scan would silently skip the one table whose exposure matters most — so the
 * CI coverage check works from this list, and separately asserts that every table
 * carrying a tenant_id column appears in it.
 */
export interface TenantScopedTable {
  readonly table: string;
  /** The column the RLS predicate compares against app.tenant_id. */
  readonly scopeColumn: string;
  readonly note?: string;
}

export const TENANT_SCOPED_TABLES: readonly TenantScopedTable[] = [
  {
    table: 'tenant',
    scopeColumn: 'id',
    note: 'The row is the tenant, so the predicate is on the primary key. Not discoverable by a tenant_id column scan.',
  },
  {
    table: 'audit_event',
    scopeColumn: 'tenant_id',
  },
  // Slice 002 adds `membership` here (tenant_id). Adding the table without adding it
  // to this list must break the build.
];

/** Tables that legitimately hold no tenant data and therefore carry no policy. */
export const GLOBAL_TABLES: readonly string[] = ['plan', 'schema_migration'];

export const isTenantScoped = (table: string): boolean =>
  TENANT_SCOPED_TABLES.some((t) => t.table === table);
