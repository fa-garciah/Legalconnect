# Phase 1 — Data Model: Case Documents

**Feature**: `007-document-management` | **Date**: 2026-08-28
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

---

## Two new tables, one new column on an existing table, zero other changes

| Table / Column | Owner | Extends |
|---|---|---|
| `document_category` | This slice | Nothing — a new tenant-scoped catalog, structurally identical to `006`'s `case_status`/`matter_type`/`venue` and `017`'s `position` |
| `document` | This slice | `case_file` (006) and `membership` (002), by foreign key only — never a modification of either |
| `tenant.storage_bytes_used` | This slice | `tenant` (001) — the running counter D3 decided on. The one column this slice adds to a table it does not own |

## `document_category`

```ts
export const documentCategoryStatus = pgEnum('document_category_status', ['active', 'retired']);

export const documentCategory = pgTable(
  'document_category',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenant.id),
    name: text('name').notNull(),
    status: documentCategoryStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [
    // research.md D1 — same partial-unique shape as 006's three catalogs and 017's
    // position catalog: active names collide case-insensitively per tenant; a
    // retired name is free to reuse.
    uniqueIndex('document_category_tenant_active_name_unique')
      .on(t.tenantId, sql`lower(trim(${t.name}))`)
      .where(sql`${t.status} = 'active'`),
  ],
);
```

## `document`

```ts
export const documentStatus = pgEnum('document_status', ['active', 'withdrawn']);

export const document = pgTable(
  'document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenant.id),
    // FR-001: exactly one case, immutable after upload — no update path touches this column.
    caseId: uuid('case_id').notNull().references(() => caseFile.id),
    // FR-002: membership-scoped attribution, never an identity directly.
    uploadedByMembershipId: uuid('uploaded_by_membership_id').notNull().references(() => membership.id),
    // FR-010: never null — an upload naming no category resolves to the tenant's
    // "unclassified" default BEFORE this row is inserted, not by a nullable column
    // with special-cased display logic.
    categoryId: uuid('category_id').notNull().references(() => documentCategory.id),
    // The S3 object key, namespaced by tenant (research.md D6): tenant/{tenantId}/case/{caseId}/{id}.
    // No bucket name or credential is stored here — those live only inside
    // common/storage/object-store/, never in a queryable column.
    storageKey: text('storage_key').notNull().unique(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    status: documentStatus('status').notNull().default('active'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  },
  (t) => [
    index('document_case_active_idx').on(t.caseId, t.status),
    check('document_withdrawn_at_consistent', sql`
      (${t.status} = 'withdrawn' AND ${t.withdrawnAt} IS NOT NULL)
      OR (${t.status} = 'active' AND ${t.withdrawnAt} IS NULL)
    `),
  ],
);
```

`tenantId` is denormalised onto `document` for the same reason every other
tenant-scoped table in this codebase carries its own column directly (017's
`directory_entry`, 006's `case_assignment`) — RLS predicates compare a column on the
row being checked, not a value reached through a join to `case_file`.

## `tenant.storage_bytes_used` (new column, D3)

```ts
// Added to the existing `tenant` table (001) — not a new table.
storageBytesUsed: bigint('storage_bytes_used', { mode: 'number' }).notNull().default(0),
```

Incremented by a single atomic conditional `UPDATE` that also performs the limit
check (research.md D4 — corrected there from an earlier, racy two-statement draft),
never decremented by withdrawal (FR-015), compared against `PlanLimits.storageBytes`
(004, already exists, previously unwired — research.md D3).

**Grant note, discovered during implementation.** `lc_app` held only `SELECT` on
`tenant` (0006, 004's own deliberate narrowing). This column's `UPDATE` needed a new,
narrow **column-level** grant — `0029_tenant_storage_counter_grant.sql`,
`GRANT UPDATE (storage_bytes_used) ON tenant TO lc_app` — nothing else on `tenant`
becomes writable to `lc_app`. `tenant`'s existing `tenant_own_row` RLS policy (0005,
`FOR ALL`, own row only) already covered this column correctly; no policy change was
needed.

## RLS — mirrors `case_file`'s own shape (006), `FOR ALL` per 017's precedent

```sql
ALTER TABLE document_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_category FORCE ROW LEVEL SECURITY;
ALTER TABLE document ENABLE ROW LEVEL SECURITY;
ALTER TABLE document FORCE ROW LEVEL SECURITY;

CREATE POLICY document_category_own_tenant ON document_category
  FOR ALL TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY document_own_tenant ON document
  FOR ALL TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- No DELETE grant on either table — FR-004/FR-012's "never hard-deleted" is the
-- absent grant, the same discipline 001/002/006/017 already established.
GRANT SELECT, INSERT, UPDATE ON document_category TO lc_app;
GRANT SELECT, INSERT, UPDATE ON document TO lc_app;
```

`FOR ALL` (not split SELECT/UPDATE) because, like `position`/`directory_entry` (017),
`lc_app` legitimately INSERTs into both tables directly on an authorized member's own
request — no analogue of `accept_invitation()`'s definer-function seam applies here.

The RLS policy on `document` is necessary but not sufficient for tenant isolation of
this slice's data: it protects the **metadata row**. The **binary content** in S3 has
no RLS of its own — that gap is what research.md D6 closes, entirely outside
PostgreSQL.

## Scope resolution (FR-005–FR-008) — reused, not reimplemented

No `assigned` resolver is registered by this slice. **Every document-specific route is
nested under its case** (`/tenant/cases/:caseId/documents/:id/...`) rather than a flat
`/tenant/documents/:id` shape, because `@ScopeTarget(paramName)`
(`common/authz/declare.ts`) reads a route parameter directly —
`AuthorizationInterceptor`'s `scopeTargetOf` (`common/authz/interceptor.ts`) has no
async-lookup extension point, only `request.params[paramName]`. `006` never needed one
for exactly this reason: every one of its `assigned`-scoped routes already carried
`:caseId` in its own path. This slice follows the identical shape instead of extending
a mechanism `004` owns.

Every `assigned`-scoped route declares `@ScopeTarget('caseId')` against the URL's own
`:caseId` segment, handed to `006`'s existing `AssignedScopeResolver`
(`backend/src/modules/case-core/assigned-scope.resolver.ts`), registered under
`resolverFor('assigned')` — the same resolver instance `case.read`,
`case.change_status` and `case.manage_team` already use. `MP`/`SA` bypass
unconditionally inside that resolver (006's Decision 2); this slice makes no
independent decision about that exemption (FR-008).

The resolver never sees a document id. Confirming that a named `:id` actually belongs
to the named `:caseId` is an ordinary repository predicate, not a second
authorization mechanism:

```ts
// backend/src/modules/documents/documents.repository.ts
async findInCase(id: string, caseId: string): Promise<DocumentRow | null> {
  // RLS-scoped, AND scoped to the case named in the URL. A document that exists but
  // belongs to a DIFFERENT case resolves to null here — the same generic not-found a
  // document that does not exist at all produces, preserving FR-007's opacity without
  // a second lookup mechanism.
  const row = await currentTx().execute<RawDocumentRow>(sql`
    SELECT * FROM document WHERE id = ${id}::uuid AND case_id = ${caseId}::uuid
  `);
  return row.rows[0] ? present(row.rows[0]) : null;
}
```

## Audit vocabulary extension

```ts
// backend/src/common/audit/actions.ts — AUDIT_ACTIONS gains seven entries.
'document.uploaded',
'document.category_changed',
'document.withdrawn',
'document.restored',
'document_category.created',
'document_category.retired',
'document.previewed',
'document.downloaded',
```

`document.previewed` and `document.downloaded` join `CHANNEL_GATED_ACTIONS` alongside
`case.read` (006's own precedent) — FR-020's requirement that automated traffic not
inflate the log it is watching. The remaining six are unconditional, following
017/006's own reasoning: none is a read of a monitorable log. `document_category.*`
mirrors `position.*`'s naming (017) exactly.

Reading a case's document **list** is deliberately absent from this vocabulary
(FR-021) — the same resolved reasoning 006 already applied to `case.read_list`.

## Capability & matrix extension (004's files, modified — FR-022)

```ts
// backend/src/common/authz/capability.ts — rows 36-43, continuing 006's numbering (25-35).
'document.upload': { scope: 'assigned' },
'document.read': { scope: 'assigned' },
'document.download': { scope: 'assigned' },
'document.change_category': { scope: 'assigned' },
'document.withdraw': { scope: 'assigned' },
'document.restore': { scope: 'assigned' },
'document.read_catalog': { scope: 'tenant' },
'document.manage_catalog': { scope: 'tenant' },
```

```ts
// backend/src/common/authz/matrix.ts
'document.upload': new Set(['MP', 'AA', 'PL', 'CM', 'SA']),
'document.read': new Set(['MP', 'AA', 'PL', 'CM', 'SA']),
'document.download': new Set(['MP', 'AA', 'PL', 'CM', 'SA']),          // D2 — equal to read
'document.change_category': new Set(['MP', 'CM', 'SA']),
'document.withdraw': new Set(['MP', 'SA']),
'document.restore': new Set(['MP', 'SA']),
'document.read_catalog': new Set(['MP', 'AA', 'PL', 'CM', 'SA']),
'document.manage_catalog': new Set(['MP', 'SA']),
```

All six `assigned`-scope rows resolve through the single lookup above — none registers
a second resolver (FR-005), and none carries a row-specific `MP`/`SA` exemption
distinct from the one `006`'s resolver already grants (FR-008).

## Key entities, restated with their persisted shape

- **Document** (`document` table): `id`, `tenantId`, `caseId` (immutable FK),
  `uploadedByMembershipId`, `categoryId` (never null), `storageKey`,
  `originalFilename`, `mimeType`, `sizeBytes`, `status` (`active` | `withdrawn`),
  `uploadedAt`, `withdrawnAt`. Never hard-deleted (FR-004). Scope is its case's scope
  (research.md, "A Document's Scope Is Its Case's Scope" in spec.md) — never an
  independent scope kind.
- **DocumentCategory** (`document_category` table): `id`, `tenantId`, `name`,
  `status` (`active` | `retired`), `createdAt`, `retiredAt`. Never hard-deleted
  (FR-012). Structurally identical to `006`'s three catalogs and `017`'s `position`.
