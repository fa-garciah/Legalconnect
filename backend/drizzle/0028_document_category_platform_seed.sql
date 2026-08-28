-- 007/FR-009, SC-010 on the production provisioning path. research.md D1 —
-- the document-category catalog follows 006/017's catalog pattern exactly,
-- including this grant, which 017 needed as a follow-up migration (0022) after
-- initially missing it and which 006 included directly in its own catalog
-- migration (0024). This slice's own 0026 missed it the same way 017's 0020 did;
-- this is that same retrofit.
--
-- Provisioning runs as lc_platform, which 0026 gave nothing at all on
-- `document_category` (that table was granted to lc_app only). One FOR INSERT
-- policy with a restricting WITH CHECK, one GRANT INSERT, and nothing else —
-- 0016/0022/0024's own discipline, restated.
--
-- What this deliberately does NOT grant: no SELECT, so the platform role cannot
-- read back even the catalog it just wrote; no UPDATE, so it can never retire or
-- edit an entry a firm owns; no DELETE, so FR-012's "never hard-deleted" holds
-- for this role exactly as it does for lc_app.
--
-- Nothing here weakens a grant or policy established by 001, 002, 004, 006 or
-- 017 (FR-015 mirrors 017/FR-015's own non-weakening constraint): it adds one
-- policy and one privilege on a table this slice introduced.

CREATE POLICY document_category_platform_seed_insert ON document_category
  FOR INSERT
  TO lc_platform
  WITH CHECK (status = 'active' AND retired_at IS NULL);

GRANT INSERT ON document_category TO lc_platform;

-- document is deliberately untouched. Seeding the catalog a firm chooses from is
-- a provisioning act; a firm's own documents are never platform-seeded.
