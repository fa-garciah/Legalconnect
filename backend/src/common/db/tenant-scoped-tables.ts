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
  {
    table: 'membership',
    scopeColumn: 'tenant_id',
    note: 'Carries a second, identity-scoped SELECT policy for self-enumeration (research.md D3, slice 002) — the tenant-scoped policy above is what this registry verifies.',
  },
  {
    table: 'invitation',
    scopeColumn: 'tenant_id',
  },
  // `identity` (slice 002) is deliberately NOT registered here: it carries no
  // tenant_id column at all and is scoped by app.identity_id instead
  // (research.md D4). It is covered by its own lockdown test, not this one.
  {
    table: 'position',
    scopeColumn: 'tenant_id',
  },
  {
    table: 'directory_entry',
    scopeColumn: 'tenant_id',
  },
  // 006-client-case-core. Six tables, all scoped the ordinary way.
  {
    table: 'client',
    scopeColumn: 'tenant_id',
  },
  {
    table: 'case_file',
    scopeColumn: 'tenant_id',
    note: 'Named case_file because CASE is a PostgreSQL reserved word (006/research.md D4); the entity and API say "case".',
  },
  {
    table: 'case_assignment',
    scopeColumn: 'tenant_id',
    note: 'tenant_id is denormalised rather than reached through case_file, so the `assigned` scope resolver\'s RLS predicate needs no join on the authorization hot path (006/research.md D1).',
  },
  {
    table: 'case_status',
    scopeColumn: 'tenant_id',
  },
  {
    table: 'matter_type',
    scopeColumn: 'tenant_id',
  },
  {
    table: 'venue',
    scopeColumn: 'tenant_id',
  },
];

/** Tables that legitimately hold no tenant data and therefore carry no policy. */
export const GLOBAL_TABLES: readonly string[] = ['plan', 'schema_migration'];

export const isTenantScoped = (table: string): boolean =>
  TENANT_SCOPED_TABLES.some((t) => t.table === table);
