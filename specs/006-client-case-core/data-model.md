# Data Model — Clients, Cases & Case Teams

**Feature**: `006-client-case-core` | **Date**: 2026-08-27
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

Six tables, four enums, three migrations. Every table follows the shape 001 established
and 017 most recently repeated: `uuid` primary key defaulted from `gen_random_uuid()`,
`tenant_id` with a foreign key to `tenant`, RLS enabled **and forced**, one `FOR ALL`
policy for `lc_app`, and **no `DELETE` grant to any role**.

Nothing here modifies a table owned by 001, 002, 004 or 017.

---

## Migration 0023 — `client`, `case_file`, `case_assignment`

### Enums

```sql
CREATE TYPE client_kind    AS ENUM ('organization', 'person');
CREATE TYPE client_status  AS ENUM ('active', 'inactive');
CREATE TYPE case_role      AS ENUM ('lead', 'collaborator', 'support');
```

### `client`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` — FR-018, not enumerable |
| `tenant_id` | `uuid` NOT NULL → `tenant(id)` | FR-001 |
| `kind` | `client_kind` NOT NULL | FR-002 |
| `legal_name` | `text` NOT NULL | FR-002 |
| `rfc` | `text` NULL | FR-002 — nullable by requirement; fiscal completeness is billing's concern |
| `status` | `client_status` NOT NULL DEFAULT `'active'` | FR-003 |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `deactivated_at` | `timestamptz` NULL | |

```sql
CONSTRAINT client_deactivated_at_consistent CHECK (
  (status = 'inactive' AND deactivated_at IS NOT NULL)
  OR (status = 'active' AND deactivated_at IS NULL)
)
```

Mirrors `position_retired_at_consistent` (0020) and `membership`'s `revoked_at` check
(0013).

```sql
-- FR-002a. Supports the case-insensitive substring filter on the client list read.
CREATE INDEX client_tenant_legal_name_lower ON client (tenant_id, lower(legal_name));
```

A plain b-tree on `lower(legal_name)` serves prefix matches; a mid-string `ILIKE '%x%'`
still scans, which is acceptable at a firm's client count (hundreds, not millions) and is
bounded by `tenant_id` and RLS before it starts. A trigram index would remove that scan,
but `pg_trgm` is an extension this deployment does not install today, and adding one for a
table this size would be premature — recorded so the option is visible if a large firm ever
makes it matter.

**No uniqueness on `legal_name`.** Spec US1 scenario 4 requires only that two tenants'
same-named clients stay distinct, which `tenant_id` already delivers. Two genuinely
different clients within one firm may share a name — two people called *Juan Pérez* is
not a data error, and a constraint here would refuse a legitimate second engagement.

### `case_file`

Named `case_file` because `CASE` is a PostgreSQL reserved word — see research D4. The
entity, the API path and the TypeScript type all remain "case."

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` — FR-018 |
| `tenant_id` | `uuid` NOT NULL → `tenant(id)` | |
| `client_id` | `uuid` NOT NULL → `client(id)` | FR-005, exactly one |
| `file_number` | `text` NOT NULL | FR-006 — the firm's own |
| `venue_case_reference` | `text` NULL | FR-006 — the court's own, a **distinct** field |
| `case_status_id` | `uuid` NOT NULL → `case_status(id)` | FR-005 |
| `matter_type_id` | `uuid` NULL → `matter_type(id)` | FR-005, optional |
| `venue_id` | `uuid` NULL → `venue(id)` | FR-005, optional — a consultative matter has none |
| `opened_on` | `date` NOT NULL DEFAULT `current_date` | |
| `closed_on` | `date` NULL | |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | cursor field for the list read |
| `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

```sql
CREATE UNIQUE INDEX case_file_tenant_file_number_unique
  ON case_file (tenant_id, lower(trim(file_number)));
```

Not partial — research D6. A closed matter's number stays taken.

**Forward references.** `case_status_id`, `matter_type_id` and `venue_id` reference tables
created in 0024. Either 0024 runs first, or the three FK constraints are added at the end
of 0024 with `ALTER TABLE`. **Choose the latter** — it keeps each migration's subject
matter in one file and matches how 0013/0014 already sequence dependent constraints.

**Cross-tenant catalog references** (US2 scenario 6) are refused in the service, not by a
constraint: a composite FK on `(tenant_id, case_status_id)` would work but requires a
redundant composite unique key on every catalog table. RLS already makes another tenant's
catalog row invisible, so the service's existence check fails naturally and returns the
validation refusal the contract specifies.

### `case_assignment`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `case_id` | `uuid` NOT NULL → `case_file(id)` | FR-009 |
| `membership_id` | `uuid` NOT NULL → `membership(id)` | FR-010 — a membership, never an identity |
| `tenant_id` | `uuid` NOT NULL → `tenant(id)` | denormalised so RLS applies without a join |
| `role_on_case` | `case_role` NOT NULL | descriptive, not authorizing (spec Assumptions) |
| `assigned_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `unassigned_at` | `timestamptz` NULL | NULL ⇒ live. FR-012 |

```sql
CREATE UNIQUE INDEX case_assignment_live_unique
  ON case_assignment (case_id, membership_id)
  WHERE unassigned_at IS NULL;
```

Research D5 — the same partial-unique pattern 017 used for active position names, applied
to live assignments. It makes "assigned twice" a database refusal rather than a race two
concurrent callers could both win.

```sql
CREATE INDEX case_assignment_membership_live
  ON case_assignment (membership_id)
  WHERE unassigned_at IS NULL;
```

Backs the list read's filter (D3), which asks "which cases is this membership on."
The unique index above backs the resolver (D1), which asks the reverse.

**Revocation closes assignments (FR-012a).** `MembershipService.revoke()` (002) calls a
function this module exports — `closeAssignmentsForMembership(tx, membershipId)` — on the
caller's own transaction, so revocation and closure cannot come apart. This is the
dependency direction 017 already established: `ProvisionService` (001) imports
`seedDefaultPositionCatalog` from the directory module and calls it on its own transaction.
Same shape, different lifecycle event. It is an `UPDATE` setting `unassigned_at`, identical
to an ordinary unassignment, so the historical row survives and no `DELETE` grant is
needed. A member holding no live assignments makes it a no-op — the common case, one
indexed statement.

**`tenant_id` is denormalised** here rather than reached through `case_file`. The resolver
runs on every `assigned`-scoped request, and an RLS policy that had to join to
`case_file` to find the tenant would put a join on the authorization path. It is kept
honest by a check that it matches the case's tenant, asserted in
`case-core-grants-lockdown.test.ts`.

### RLS and grants (0023)

```sql
ALTER TABLE client          ENABLE ROW LEVEL SECURITY;
ALTER TABLE client          FORCE  ROW LEVEL SECURITY;
ALTER TABLE case_file       ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_file       FORCE  ROW LEVEL SECURITY;
ALTER TABLE case_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_assignment FORCE  ROW LEVEL SECURITY;

CREATE POLICY client_own_tenant ON client
  FOR ALL TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
-- case_file and case_assignment: identical policies.

GRANT SELECT, INSERT, UPDATE ON client          TO lc_app;
GRANT SELECT, INSERT, UPDATE ON case_file       TO lc_app;
GRANT SELECT, INSERT, UPDATE ON case_assignment TO lc_app;
```

The `NULLIF(..., true)` form is 001's null-safe predicate, kept verbatim — Constitution
v1.3.0 records the bug that made it necessary.

**No `DELETE` to any role, on any of the three.** FR-003 and FR-012's "never hard-deleted"
is the absent grant, the discipline every prior slice used.

---

## Migration 0024 — the three catalogs

Structurally identical to `position` (0020). One enum shared by all three.

```sql
CREATE TYPE catalog_entry_status AS ENUM ('active', 'retired');
```

For each of `case_status`, `matter_type`, `venue`:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenant_id` | `uuid` NOT NULL → `tenant(id)` | FR-019 |
| `name` | `text` NOT NULL | |
| `status` | `catalog_entry_status` NOT NULL DEFAULT `'active'` | FR-020 |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `retired_at` | `timestamptz` NULL | |

**`case_status` carries one column the other two do not:**

| Column | Type | Notes |
|---|---|---|
| `is_closing` | `boolean` NOT NULL DEFAULT `false` | FR-008a — the firm's own declaration that this status ends a matter |

Set by the firm through the catalog surface, never inferred from the name. A tenant may
mark more than one status closing (*Concluido* and *Archivado*, say) or none at all; both
are legal. The default seed marks **Concluido** closing and the other two not.

Each carries the retired-at consistency check and the partial unique name index 017
established:

```sql
CREATE UNIQUE INDEX case_status_tenant_active_name_unique
  ON case_status (tenant_id, lower(trim(name)))
  WHERE status = 'active';
```

Active names collide case-insensitively per tenant; a retired name is free to reuse, which
is what makes retire-then-recreate legal. Same for `matter_type` and `venue`.

### Then, the deferred foreign keys from 0023

```sql
ALTER TABLE case_file
  ADD CONSTRAINT case_file_case_status_fk FOREIGN KEY (case_status_id) REFERENCES case_status (id),
  ADD CONSTRAINT case_file_matter_type_fk FOREIGN KEY (matter_type_id) REFERENCES matter_type (id),
  ADD CONSTRAINT case_file_venue_fk       FOREIGN KEY (venue_id)       REFERENCES venue (id);
```

The FK is what makes FR-020's "a retired entry stays resolvable" structural: retirement is
a status change, the row persists, and every case referencing it keeps resolving.

### RLS and grants (0024)

Same `FOR ALL` policy shape as 0023, for all three tables, plus the provisioning grant:

```sql
GRANT SELECT, INSERT, UPDATE ON case_status TO lc_app;
GRANT SELECT, INSERT, UPDATE ON matter_type TO lc_app;
GRANT SELECT, INSERT, UPDATE ON venue       TO lc_app;

-- Provisioning only (research D7). INSERT and nothing else — the seed uses no
-- RETURNING and no ON CONFLICT precisely so no SELECT privilege is needed.
GRANT INSERT ON case_status TO lc_platform;
GRANT INSERT ON matter_type TO lc_platform;
GRANT INSERT ON venue       TO lc_platform;
```

`lc_platform` also needs a matching RLS policy on each, mirroring
`0022_position_platform_seed.sql` — without one, `FORCE ROW LEVEL SECURITY` blocks the
provisioning insert even with the grant.

---

## Migration 0025 — audit actions

Drops and recreates `audit_event_action_known` with the ten new actions appended, the
pattern 0017 and 0021 already established. Full list in
[contracts/case-api.md](./contracts/case-api.md) §5 and research D8.

`case.read` additionally joins `CHANNEL_GATED_ACTIONS` in `common/audit/actions.ts` — a
TypeScript change, not a SQL one.

---

## The resolver's query, stated exactly

This is the artifact Principle II's post-design re-check turns on.

```ts
// assigned-scope.resolver.ts
readonly kind: ScopeKind = 'assigned';

async resolve(request: ScopeRequest): Promise<boolean> {
  const principal = request.principal;
  if (!principal) return false;                              // fail closed

  // Decision 2 — before any query. Three lines, one mechanism.
  if (principal.archetype === 'MP' || principal.archetype === 'SA') return true;

  if (!request.targetId) return false;                       // fail closed (D2)

  const result = await currentTx().execute<{ ok: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM case_assignment
       WHERE case_id       = ${request.targetId}::uuid
         AND membership_id = ${principal.membershipId}::uuid
         AND unassigned_at IS NULL
    ) AS ok
  `);
  return result.rows[0]?.ok === true;
}
```

**Why this is tenant-safe without a `tenant_id` predicate.** `currentTx()` returns the
transaction `TenantContextInterceptor` opened, on which `app.tenant_id` is already set.
`case_assignment`'s RLS policy filters to that tenant. Handed another tenant's case id,
the sub-select matches zero rows, the resolver returns `false`, and `refusalToHttp` maps
it to the same 404 a nonexistent case gets — so cross-tenant existence stays uninferable.
`assigned-scope-isolation.test.ts` asserts precisely this.

**Three fail-closed branches**, none of them a default permit: no principal, no target,
no matching row. This matches `TenantScopeResolver`'s own posture — `false` for a missing
input rather than a case treated as unreachable.

---

## The list query's filter

```sql
SELECT c.* FROM case_file c
 WHERE (
   $mpOrSa                                    -- Decision 2, bound as a boolean
   OR EXISTS (
     SELECT 1 FROM case_assignment a
      WHERE a.case_id = c.id
        AND a.membership_id = $membershipId::uuid
        AND a.unassigned_at IS NULL
   )
 )
   AND ($cursor IS NULL OR (c.created_at, c.id) < ($cursorAt, $cursorId))
 ORDER BY c.created_at DESC, c.id DESC
 LIMIT $limit + 1;
```

The `EXISTS` is inside the `WHERE`, so exclusion happens **before** `LIMIT` — a page of 50
is 50 visible cases, and `nextCursor` means what it says. Research D3 explains why a
post-fetch filter would silently shorten pages.

`toPage()` maps `created_at` into the existing `Cursor.occurredAt` field, the same way
017's directory read does. No new pagination primitive.

---

## Entity relationships

```text
tenant ──┬─< client ──< case_file >── case_status
         │                    ├────── matter_type   (nullable)
         │                    └────── venue         (nullable)
         ├─< case_status / matter_type / venue
         └─< case_assignment >── membership (002)
                     │
                     └────────── case_file
```

- One client, many cases. A client is never hard-deleted, so the edge never dangles.
- One case, many assignments; one membership, many assignments. Live-uniqueness on the
  pair.
- Catalog entries are referenced, never copied — retirement leaves the reference intact.

---

## State transitions

| Entity | States | Transition | Reverse? |
|---|---|---|---|
| `client` | `active` ↔ `inactive` | deactivate, and restore — both row 28 | **Yes** — FR-004a. Restoration shares the capability that withdraws, and is audited as its own action. `client_deactivated_at_consistent` holds in both directions: restoring clears `deactivated_at` as it sets `status = 'active'`. |
| `case_file` | open (`closed_on IS NULL`) → closed | moving to a `case_status` whose `is_closing` is true stamps `closed_on` (FR-008a) | Yes — moving to a non-closing status clears it. Same capability (row 32). |
| `case_assignment` | live → ended | unassign sets `unassigned_at`, **or** membership revocation sets it the same way (FR-012a) | Not in place — reassignment inserts a **new** row, which the partial unique index permits and which keeps history readable. A revoked membership cannot be reassigned at all: 002 treats revocation as terminal. |
| catalog entry | `active` → `retired` | retire (row 35) | Not in place — retire-then-recreate under the same name, which the partial unique index permits. 017's own D4/D6 pattern. |

**Case status is a catalog row, so "which status closes a case" is per tenant** — and
FR-008a answers it with the `is_closing` column above. An earlier revision of this document
narrowed the other way, leaving `closed_on` to whatever a caller supplied. The clarification
session of 2026-08-27 reversed that: a caller-supplied date means a case can sit in
*Concluido* with no closing date and nothing notices. The status change is now the single
place `closed_on` moves, in either direction, and no route accepts it as input.
