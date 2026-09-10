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
  // 007-document-management. Two tables, both scoped the ordinary way.
  {
    table: 'document',
    scopeColumn: 'tenant_id',
  },
  {
    table: 'document_category',
    scopeColumn: 'tenant_id',
  },
  // 003-authentication-mfa adds FIVE tables and registers NONE of them, for the
  // same reason `identity` above is absent: none carries a tenant_id column, so
  // none is discoverable by this registry's companion column scan and none needs
  // an exemption from it. rls-coverage.test.ts asserts that every table CARRYING
  // tenant_id appears here; these do not carry it, so they pass it as written.
  // Verified rather than assumed — the suite runs 31/31 green with all five
  // present in the database.
  //
  //   identity_credential, identity_factor, backup_code, session, refresh_token
  //
  // The constitution states this exception directly for identity and session
  // data: "The `identity` table and the session table are tenant-global by design
  // and therefore carry no tenant_id and no RLS policy of their own... a person
  // exists before and across tenants." This slice extends it only to material that
  // HANGS OFF an identity — its credential, its factor, its codes, its sessions.
  // None is meaningful per tenant: one credential authenticates one person, who
  // may hold membership in several firms (001/FR-021).
  //
  // ISOLATION IS NOT WEAKENED BY THIS, and the reason is worth stating because the
  // absence of five tables from this list looks like the thing this file exists to
  // catch. `membership` remains the sole resolver from an identity to tenant data
  // and remains policied normally. What 003 changes is that the identity reaching
  // that resolver is now PROVEN rather than asserted by an `x-identity-id` header.
  //
  // These five are protected by GRANTS rather than by policies, which is a
  // stronger control and a differently-shaped one: lc_app holds no privilege at
  // all on the three material tables, so the question a policy would answer —
  // which rows may this role see — never arises, because it may not read the table.
  // auth-grants-lockdown.test.ts is their coverage, asserting permission denied
  // rather than an empty result. A slice that adds a tenant_id column to any of
  // them is changing a constitutional decision and needs an amendment, not a row
  // in this list.
];

/** Tables that legitimately hold no tenant data and therefore carry no policy. */
export const GLOBAL_TABLES: readonly string[] = ['plan', 'schema_migration'];

export const isTenantScoped = (table: string): boolean =>
  TENANT_SCOPED_TABLES.some((t) => t.table === table);
