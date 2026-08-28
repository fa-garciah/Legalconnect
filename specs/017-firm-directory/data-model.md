# Phase 1 — Data Model: Firm Directory

**Feature**: `017-firm-directory` | **Date**: 2026-08-26
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

---

## Two new tables, zero changes to any table 001/002/004 own

| Table | Owner | Extends |
|---|---|---|
| `position` | This slice | Nothing — a new tenant-scoped catalog |
| `directory_entry` | This slice | `membership` (002), by foreign key only (FR-014) |

## `position`

```ts
export const positionStatus = pgEnum('position_status', ['active', 'retired']);

export const position = pgTable(
  'position',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenant.id),
    name: text('name').notNull(),
    status: positionStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [
    // research.md D6 — active names collide case-insensitively per tenant; a
    // retired name is free to reuse.
    uniqueIndex('position_tenant_active_name_unique')
      .on(t.tenantId, sql`lower(trim(${t.name}))`)
      .where(sql`${t.status} = 'active'`),
  ],
);
```

## `directory_entry`

```ts
export const directoryEntry = pgTable(
  'directory_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // FR-001: extends exactly one live membership. One row per membership, ever —
    // the unique constraint is what makes "upsert on first assignment" (research.md
    // D1) correct rather than accidentally creating duplicates.
    membershipId: uuid('membership_id').notNull().unique().references(() => membership.id),
    tenantId: uuid('tenant_id').notNull().references(() => tenant.id),
    // FR-002: at most one position, MAY be unset.
    positionId: uuid('position_id').references(() => position.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);
```

`tenantId` is denormalised onto `directory_entry` (rather than joined through
`membershipId -> membership.tenant_id` on every RLS check) for the same reason every
other tenant-scoped table in this codebase carries its own `tenant_id` column directly —
RLS predicates compare a column on the row being checked, not a value reached through a
join, so the policy can be the same one-line shape every other table's policy already is.

## RLS — mirrors `membership`'s own shape (0013)

```sql
ALTER TABLE position ENABLE ROW LEVEL SECURITY;
ALTER TABLE directory_entry ENABLE ROW LEVEL SECURITY;

CREATE POLICY position_own_tenant ON position
  FOR ALL TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY directory_entry_own_tenant ON directory_entry
  FOR ALL TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON position TO lc_app;
GRANT SELECT, INSERT, UPDATE ON directory_entry TO lc_app;
-- No DELETE grant anywhere, for either table — FR-004/FR-007's "never hard-deleted"
-- is the absent grant, the same discipline 001/FR-011 established for tenant and
-- 002 established for membership/invitation.
```

Both policies use `FOR ALL` (rather than membership's split SELECT/UPDATE policies)
because, unlike `membership`, `lc_app` legitimately INSERTs into both of these tables
directly — no analogue of `accept_invitation()`'s definer-function seam applies here;
an SA/MP's own tenant-scoped request creates the row, same as it does for a plan change.

## Capability & matrix extension (004's files, modified — FR-016)

```ts
// backend/src/common/authz/capability.ts — three new rows, no tier/limit key (matches
// every other row today — plan.md Open Item 4 of 004 still has no owner).
'directory.assign_position': { scope: 'tenant' },
'directory.manage_catalog': { scope: 'tenant' },
'directory.read': { scope: 'tenant' },
```

```ts
// backend/src/common/authz/matrix.ts
'directory.assign_position': new Set(['MP', 'SA']),
'directory.manage_catalog': new Set(['MP', 'SA']),
'directory.read': new Set(['MP', 'AA', 'PL', 'CM', 'BM', 'SA']),
```

`capabilityDef`'s fallback and `MATRIX`'s total-`Record` typing (004, D1) mean these
three rows are compile-time-required the instant `CapabilityId` picks them up — the
same FR-021 build gate 004 already ships, exercised again by this slice rather than
rebuilt.

## Audit vocabulary extension

```ts
// backend/src/common/audit/actions.ts — AUDIT_ACTIONS gains three entries.
'position.created',
'position.retired',
'directory.position_assigned',
```

None is channel-gated (`CHANNEL_GATED_ACTIONS`) — none is a read of a monitorable log,
the same reasoning 002's nine additions already carried (`backend/src/common/audit/
actions.ts`'s own header comment).

## Migrations

- **`0020_directory.sql`** — both tables, both enums, both RLS policies, both grants,
  the functional unique index (research.md D6). Adds no column to `tenant`,
  `membership`, `identity` or `invitation`.
- **`0021_directory_audit_actions.sql`** — extends `audit_event_action_known` (0003,
  last touched by 0017) with the three actions above, following 0017's exact pattern:
  `DROP CONSTRAINT` / `ADD CONSTRAINT ... CHECK (action IN (...))` restating the full
  list.

## Key entities, restated with their persisted shape

- **Position** (`position` table): `id`, `tenantId`, `name`, `status` (`active` |
  `retired`), `createdAt`, `retiredAt`. Never hard-deleted (FR-007).
- **DirectoryEntry** (`directory_entry` table): `id`, `membershipId` (unique FK),
  `tenantId`, `positionId` (nullable FK), `updatedAt`. Never hard-deleted (FR-004); a
  row's absence and a row with `positionId IS NULL` are both "no position assigned"
  (research.md D1) — the entity is never deleted once created, but may legitimately
  never be created at all for a membership nobody has assigned a position to yet.
