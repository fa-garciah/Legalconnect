-- 0045 — the default document category is "Sin clasificar" (021-frontend-documents, Decision 5,
-- approved by Francisco Garcia, CC technical lead, 2026-09-23).
--
-- WHY. 007 seeded every firm's default category — the one an upload naming no category lands in
-- (007/FR-010) — as the English literal "Unclassified", and the default lookup matched that
-- literal. Every firm of a Spanish-language product saw an English word in its catalog, its
-- document lists and its exports.
--
-- WHAT. For each firm, rename its "Unclassified" rows to "Sin clasificar" — UNLESS the firm already
-- created an active "Sin clasificar" of its own. Renaming then would collide with
-- `document_category_tenant_active_name_unique` (active names are unique per firm, trimmed and
-- case-insensitive), and silently merging two categories a firm chose to keep apart is not this
-- migration's call. Such a firm keeps both; the default lookup prefers the Spanish one
-- (`documents.repository.ts`, `findDefaultCategory`), so its uploads land in "Sin clasificar".
--
-- Idempotent: once renamed, no "Unclassified" row is left for the second run to match. Documents
-- reference categories by id, so no document changes. No policy, grant or audit action changes.
UPDATE document_category AS c
   SET name = 'Sin clasificar'
 WHERE lower(trim(c.name)) = 'unclassified'
   AND NOT EXISTS (
         SELECT 1
           FROM document_category AS other
          WHERE other.tenant_id = c.tenant_id
            AND other.status = 'active'
            AND lower(trim(other.name)) = 'sin clasificar'
       );
