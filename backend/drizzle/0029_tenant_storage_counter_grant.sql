-- 007-document-management, research.md D3/D4. `lc_app` holds SELECT-only on
-- `tenant` since 0006 (004's own deliberate narrowing — plan/RFC/status changes
-- all go through `lc_platform`). This slice's upload path runs as `lc_app` and
-- needs to increment ONE column, `storage_bytes_used`, on the tenant's own row.
--
-- A column-level GRANT is the narrow fix: `lc_app` gains UPDATE on exactly this
-- one column, nothing else on `tenant` — name, rfc, plan_id, status remain as
-- immutable to `lc_app` as they were before this migration. The existing RLS
-- policy (`tenant_own_row`, 0005, FOR ALL, own row only) already covers this
-- correctly; no policy change is needed, only the grant that was missing.
--
-- Nothing here weakens a grant established by 001 (FR-015, mirrored from
-- 017/006's own non-weakening constraint): SELECT is untouched, and the new
-- UPDATE privilege is scoped to a single column this slice itself introduced.

GRANT UPDATE (storage_bytes_used) ON tenant TO lc_app;
