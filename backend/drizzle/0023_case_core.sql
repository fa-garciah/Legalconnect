-- Clients, cases and case teams. 006-client-case-core, data-model.md.
-- Adds no column to any table 001, 002, 004 or 017 own.
--
-- The case table is `case_file`, not `case`: CASE is a PostgreSQL reserved word, so
-- `CREATE TABLE case` is a syntax error and every hand-written statement would have to
-- quote it forever (research.md D4). The entity, the API path and the TypeScript type
-- all remain "case"; only the relation is renamed. `case_file` also maps onto
-- *expediente*, the term the domain already uses, and onto `file_number` below.

CREATE TYPE client_kind   AS ENUM ('organization', 'person');
CREATE TYPE client_status AS ENUM ('active', 'inactive');
CREATE TYPE case_role     AS ENUM ('lead', 'collaborator', 'support');

-- ---------------------------------------------------------------------------
-- client
-- ---------------------------------------------------------------------------

CREATE TABLE client (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant (id),
  kind            client_kind NOT NULL,
  legal_name      text NOT NULL,
  -- FR-002: nullable by requirement. Fiscal completeness is a billing-slice concern,
  -- and refusing a client because their RFC has not been collected yet would block
  -- intake for a reason this slice does not own.
  rfc             text,
  status          client_status NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deactivated_at  timestamptz,

  -- Mirrors position_retired_at_consistent (0020) and membership's revoked_at check
  -- (0013). Holds in BOTH directions: FR-004a restores a client by clearing
  -- deactivated_at as it sets status back to 'active'.
  CONSTRAINT client_deactivated_at_consistent CHECK (
    (status = 'inactive' AND deactivated_at IS NOT NULL)
    OR (status = 'active' AND deactivated_at IS NULL)
  )
);

COMMENT ON TABLE client IS
  'Never hard-deleted (FR-003) — withdrawal is a status change, and it is reversible (FR-004a). A deactivated client stays resolvable by every case referencing it and is refused for new cases.';

-- FR-002a. Backs the case-insensitive name filter on the client list read. A prefix
-- match uses this index; a mid-string ILIKE still scans, which is acceptable at a firm's
-- client count and is bounded by tenant_id and RLS before it starts (data-model.md).
CREATE INDEX client_tenant_legal_name_lower ON client (tenant_id, lower(legal_name));

-- No uniqueness on legal_name, deliberately. US1 scenario 4 requires only that two
-- TENANTS' same-named clients stay distinct, which tenant_id already delivers. Two
-- different people called Juan Pérez at one firm is not a data error, and a constraint
-- here would refuse a legitimate second engagement.

-- ---------------------------------------------------------------------------
-- case_file
-- ---------------------------------------------------------------------------

CREATE TABLE case_file (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant (id),
  client_id             uuid NOT NULL REFERENCES client (id),
  -- FR-006: two distinct fields. The prototype had one and could not express both.
  -- file_number is the firm's own; venue_case_reference is the court's.
  file_number           text NOT NULL,
  venue_case_reference  text,
  -- FK constraints for these three are added at the end of 0024, which creates the
  -- catalogs. Keeping each migration's subject matter in one file, the same way
  -- 0013/0014 already sequence dependent constraints.
  case_status_id        uuid NOT NULL,
  matter_type_id        uuid,
  venue_id              uuid,
  opened_on             date NOT NULL DEFAULT current_date,
  -- FR-008a: derived from the target status's is_closing, never accepted as input.
  closed_on             date,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE case_file IS
  'The domain root. Named case_file because CASE is reserved (research.md D4); the entity and API say "case". closed_on is derived from the tenant''s own case_status.is_closing (FR-008a), never supplied by a caller.';

-- FR-007. Not partial, unlike position''s active-name index: a closed matter's number
-- stays taken, because reusing it would corrupt the firm's own records.
CREATE UNIQUE INDEX case_file_tenant_file_number_unique
  ON case_file (tenant_id, lower(trim(file_number)));

-- ---------------------------------------------------------------------------
-- case_assignment
-- ---------------------------------------------------------------------------

CREATE TABLE case_assignment (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        uuid NOT NULL REFERENCES case_file (id),
  -- FR-010: a membership, never an identity. The same person at two firms holds two
  -- unrelated sets of assignments, exactly as 017/FR-001 treats position.
  membership_id  uuid NOT NULL REFERENCES membership (id),
  -- Denormalised rather than reached through case_file. The `assigned` resolver runs on
  -- every scoped request, and an RLS policy that had to join to case_file to find the
  -- tenant would put a join on the authorization path. Kept honest by an assertion in
  -- case-core-grants-lockdown.test.ts that it always matches the case's tenant.
  tenant_id      uuid NOT NULL REFERENCES tenant (id),
  role_on_case   case_role NOT NULL,
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  unassigned_at  timestamptz
);

COMMENT ON TABLE case_assignment IS
  'The entity the `assigned` scope resolver reads, and the reason it can answer without a cache (FR-011). Never hard-deleted (FR-012): unassignment sets unassigned_at, and so does membership revocation (FR-012a).';

-- research.md D5 — 017's position_tenant_active_name_unique pattern applied to a
-- different pair. Makes "assigned twice" a database refusal rather than a read-then-write
-- race two concurrent callers could both win, while leaving history reusable.
CREATE UNIQUE INDEX case_assignment_live_unique
  ON case_assignment (case_id, membership_id)
  WHERE unassigned_at IS NULL;

-- Backs the list read's filter (D3): "which cases is this membership on". The unique
-- index above backs the resolver (D1), which asks the reverse.
CREATE INDEX case_assignment_membership_live
  ON case_assignment (membership_id)
  WHERE unassigned_at IS NULL;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

ALTER TABLE client          ENABLE ROW LEVEL SECURITY;
ALTER TABLE client          FORCE  ROW LEVEL SECURITY;
ALTER TABLE case_file       ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_file       FORCE  ROW LEVEL SECURITY;
ALTER TABLE case_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_assignment FORCE  ROW LEVEL SECURITY;

-- One FOR ALL policy each, the shape 017 established for position/directory_entry:
-- lc_app legitimately INSERTs into all three directly, so membership's split
-- SELECT/UPDATE policies are not needed here.
--
-- NULLIF(..., true) is 001's null-safe predicate, kept verbatim — Constitution v1.3.0
-- records the bug that made it necessary.
CREATE POLICY client_own_tenant ON client
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY case_file_own_tenant ON case_file
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY case_assignment_own_tenant ON case_assignment
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- No DELETE grant on any of the three, to any role. FR-003 and FR-012's "never
-- hard-deleted" is the absent grant, the same discipline every prior slice used for
-- tenant, membership, invitation, position and directory_entry.
GRANT SELECT, INSERT, UPDATE ON client          TO lc_app;
GRANT SELECT, INSERT, UPDATE ON case_file       TO lc_app;
GRANT SELECT, INSERT, UPDATE ON case_assignment TO lc_app;
