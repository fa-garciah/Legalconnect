# Implementation Plan: Case Notes and Case Activity

**Branch**: `008-notes-and-activity` | **Date**: 2026-10-09 | **Spec**: [spec.md](./spec.md) |
**Data model**: [data-model.md](./data-model.md) | **Contract**: [contracts/notes-activity-api.md](./contracts/notes-activity-api.md)

## Summary

One tenant table (`case_note`), one backend module (`modules/notes`) holding notes and the activity
read, four capability rows (52–55), four audit actions. On the frontend, two per-matter pages
(`/expedientes/:caseId/notas`, `/expedientes/:caseId/actividad`) linked from the case panel. `022`'s
demo seed gains notes and no audit rows. No new dependency; no change to any existing matrix row.

## Technical Context

**Language/Version**: TypeScript 5 (Node 22) — NestJS backend, Next.js frontend.
**Primary Dependencies**: existing only (Drizzle `sql`, TanStack Query, zod, `ui/` primitives).
**Storage**: PostgreSQL 16 with RLS; migration `0049_case_note.sql`. The activity read uses
`audit_event`, on which `lc_app` already holds `SELECT` under RLS (`0006_grants.sql:15`).
**Testing**: Vitest unit / contract / integration against Docker Postgres; Testing Library; Playwright.
**Constraints**: Principle II (RLS, opaque 404, oracle table), IV (rows 52–55, `assigned` via the
resolver), V (one audit row per mutation; `note.list_read` per interactive read; no delete), VI
(no note text in any audit row; no metadata values in the feed; no email anywhere).
**Scale/Scope**: 5 routes, 1 table, 4 capabilities, 4 audit actions, 2 pages.

## Routes

| # | Method & path | Capability (row) | Audit |
|---|---|---|---|
| 1 | `GET /tenant/cases/:caseId/notes?month=YYYY-MM` | `note.read` (52) | `note.list_read` (interactive only) |
| 2 | `POST /tenant/cases/:caseId/notes` | `note.create` (53) | `note.created` |
| 3 | `PATCH /tenant/cases/:caseId/notes/:noteId` | `note.correct_own` (54) | `note.corrected` `{changed:['body']}` |
| 4 | `POST /tenant/cases/:caseId/notes/:noteId/void` | `note.correct_own` (54) | `note.voided` |
| 5 | `GET /tenant/cases/:caseId/activity?month=YYYY-MM` | `case.read_activity` (55) | — |

All five are `assigned` with `@ScopeTarget('caseId')`: the resolver (firm-checked for every
archetype since `fix-cross-tenant-fk-oracle`) decides reach; no service re-checks it.

## Where each rule lives

| Rule | Where |
|---|---|
| Reach | 006's `AssignedScopeResolver`, through the interceptor |
| Own note, in window, not voided | `notes.repository.ts` `lockOwn` (`FOR UPDATE`) + service |
| Body bounds, month format | `note-input.ts` (pure) and `0049` `CHECK`s |
| Visibility = internal | `0049` `CHECK (visibility = 'internal')`; no route reads it from input |
| Mexico City month window | SQL on the request transaction (`AT TIME ZONE 'America/Mexico_City'`) |
| Which audit rows are a matter's activity | `activity.repository.ts`: one query, allow-list + per-entity join (FR-012, FR-013) |
| Minimisation | `activity.repository.ts` selects no `metadata` column except `metadata->>'caseId'` in the `WHERE`; `present()` emits only action, time, actor, position, file name |
| One `note.list_read` per interactive read | `@Audited` on route 1 + `CHANNEL_GATED_ACTIONS` |

## Activity query (shape)

```sql
SELECT a.id, a.action, a.occurred_at, a.actor_membership_id, p.name AS position,
       CASE WHEN a.target_entity = 'document' THEN d.original_filename END AS file_name
  FROM audit_event a
  LEFT JOIN document d        ON a.target_entity = 'document'       AND d.id = a.target_id
  LEFT JOIN calendar_event e  ON a.target_entity = 'calendar_event' AND e.id = a.target_id
  LEFT JOIN case_note n       ON a.target_entity = 'case_note'      AND n.id = a.target_id
  LEFT JOIN directory_entry de ON de.membership_id = a.actor_membership_id
  LEFT JOIN position p        ON p.id = de.position_id
 WHERE a.action = ANY(:allowList)
   AND a.occurred_at >= :monthStart AND a.occurred_at < :nextMonthStart
   AND ( (a.target_entity = 'case_file' AND a.target_id = :caseId)
      OR (a.target_entity = 'membership' AND a.metadata->>'caseId' = :caseId)
      OR d.case_id = :caseId OR e.case_id = :caseId OR n.case_id = :caseId )
 ORDER BY a.occurred_at DESC, a.id
 LIMIT 201
```

The 201st row only sets `truncated: true`. RLS on every joined table keeps it in the firm.

## Structure

```text
backend/drizzle/0049_case_note.sql
backend/src/modules/notes/
  notes.module.ts · notes.controller.ts · notes.service.ts · notes.repository.ts
  note-input.ts (pure) · activity.controller.ts · activity.repository.ts · activity-actions.ts (allow-list)
backend/src/common/{audit/actions.ts, authz/capability.ts, authz/matrix.ts, db/tenant-scoped-tables.ts, http/errors.ts}
backend/drizzle/seed.ts (one fixture note per tenant) · backend/drizzle/demo/notes.ts · seed-demo.ts
frontend/src/notes/{types,api,month,schema,activity-copy}.ts
frontend/src/app/expedientes/[caseId]/notas/{page,NotesView,NoteComposer,CorrectNoteDialog,VoidNoteDialog}.tsx
frontend/src/app/expedientes/[caseId]/actividad/{page,ActivityView}.tsx
frontend/src/app/expedientes/CaseDetailPanel.tsx (two links)
frontend/src/{authz/capability-matrix.ts, configuracion/matrix-view-model.ts}
```

## Coverage

No billable-hour or fee calculation here. `note-input.ts` and `activity-actions.ts` are pure and
fully unit-tested; the module is held to the project's global thresholds.

## Constitution Check

| Principle | How | Status |
|---|---|---|
| I | spec → plan → tasks; catalog amended (EP14 clarification, US03, item 5) | ✅ |
| II | RLS forced on `case_note`; no-context fixture; isolation test; 5 routes in the oracle table | ✅ |
| III | no firm-specific rule; visibility is product-wide | ✅ |
| IV | rows 52–55 + matrix tests + frontend mirror; all `assigned` via the resolver | ✅ |
| V | 4 actions in a re-issued `CHECK`; one row per mutation; notes-list access recorded; no delete | ✅ |
| VI | no note text in audit; no metadata values in the feed; no email | ✅ |
| TDD | tests before code in every task | ✅ |

No violations. Complexity Tracking: *none*.
