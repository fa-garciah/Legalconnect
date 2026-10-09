# Implementation Plan: Recording Time

**Branch**: `009-time-tracking` | **Date**: 2026-10-08 | **Spec**: [spec.md](./spec.md) |
**Data model**: [data-model.md](./data-model.md) | **Contract**: [contracts/time-entries-api.md](./contracts/time-entries-api.md)

## Summary

One tenant table (`time_entry`), one backend module (`modules/time-entries`), four capability rows
(48–51) and six audit actions on the backend; a `/horas` page with a timer card, a manual-entry
dialog, a correction dialog, a void confirmation and a timesheet grouped by day on the frontend.
`022`'s demo seed gains six uneven weeks of hours. No new dependency, no change to any existing
matrix row, no change to `006`'s resolver.

## Technical Context

**Language/Version**: TypeScript 5 (Node 22) — NestJS 11 backend, Next.js frontend, as every slice.
**Primary Dependencies**: existing only — Drizzle `sql` (raw, as `calendar.repository.ts`),
TanStack Query, zod, `ui/` primitives, lucide icons.
**Storage**: PostgreSQL 16 with RLS; migration `0048_time_entry.sql`.
**Testing**: Vitest (unit, contract through the real app, integration against Postgres in Docker),
Testing Library (component), Playwright (e2e against `022`'s demo firm).
**Target Platform**: web, responsive.
**Performance Goals**: the timesheet read is one range-capped query (≤ 62 days, a few hundred rows
per person at most); no pagination, as `013`.
**Constraints**: Principle II (RLS, cross-tenant 404), IV (rows 48–51, `assigned` via `006`'s
resolver), V (one audit row per mutation, no delete), VI (`BM`/`SA` hold nothing; audit metadata
carries no description, duration or date).
**Scale/Scope**: 8 routes, 1 table, 4 capabilities, 6 audit actions, 1 page.

## Routes

| # | Method & path | Capability (row, scope) | Audit | Notes |
|---|---|---|---|---|
| 1 | `GET /tenant/time-entries?from&to` | `time.read_own` (49, tenant) | — | own `logged` entries on reachable matters + totals (FR-009, FR-010) |
| 2 | `GET /tenant/time-entries/timer` | `time.read_own` (49, tenant) | — | own running timer, matter only if reachable (FR-008) |
| 3 | `POST /tenant/time-entries/timer/discard` | `time.discard_timer` (51, tenant) | `time_entry.timer_discarded` | own running timer → voided |
| 4 | `POST /tenant/cases/:caseId/time-entries` | `time.log` (48, assigned) | `time_entry.logged` | manual entry |
| 5 | `POST /tenant/cases/:caseId/time-entries/timer` | `time.log` (48, assigned) | `time_entry.timer_started` | `409 timer_running` on the partial unique index |
| 6 | `POST /tenant/cases/:caseId/time-entries/timer/stop` | `time.log` (48, assigned) | `time_entry.timer_stopped` | `409 no_running_timer`, `409 timer_too_long` |
| 7 | `PATCH /tenant/cases/:caseId/time-entries/:entryId` | `time.correct_own` (50, assigned) | `time_entry.corrected` `{changed:[…]}` | own, logged, in window |
| 8 | `POST /tenant/cases/:caseId/time-entries/:entryId/void` | `time.correct_own` (50, assigned) | `time_entry.voided` | own, logged, in window |

Routes 4–8 carry `@ScopeTarget('caseId')`. Routes 1–3 are on a separate controller
(`tenant/time-entries`) so the nested one (`tenant/cases/:caseId/time-entries`) never needs an
exception to `scope-target-declared.test.ts`.

## Where each rule lives

| Rule | Where | Why there |
|---|---|---|
| Reach for writes | `006`'s `AssignedScopeResolver` via the interceptor | the global mechanism (constitution, NestJS table) — Decision 9 |
| Reach for reads | `time-entries.repository.ts` `visibleTo()` predicate | a list cannot be `assigned`-scoped (spec finding #5) |
| Own entry only | repository `WHERE membership_id = $me` on every read and write | nobody touches another person's time (Decision 2) |
| Elapsed → minutes, totals, labels | `time-entries/duration.ts` (pure) | FR-020, 100% coverage, blocking |
| Body validation | `time-entries/time-entry-input.ts` (pure) | readable `400`s; every bound is also a CHECK |
| Today, the work day, the window | SQL, on the request transaction's clock (`now()`) | one clock for `logged_at`, the window and "today" |
| One running timer | partial unique index; `23505` → `409 timer_running` | the only race-free place |
| Idempotent stop/void | `UPDATE … WHERE status = 'running'/'logged' RETURNING`; zero rows → `409` | a double click writes one row and one audit entry |

## Structure

```text
backend/drizzle/0048_time_entry.sql
backend/src/modules/time-entries/
  time-entries.module.ts
  time-entries.controller.ts       # nested, routes 4–8
  timesheet.controller.ts          # flat, routes 1–3
  time-entries.service.ts
  time-entries.repository.ts
  time-entry-input.ts              # pure validation
  duration.ts                      # pure: minutesFromElapsed, sumMinutes, dayTotals
backend/src/common/{audit/actions.ts, authz/capability.ts, authz/matrix.ts, db/tenant-scoped-tables.ts, http/errors.ts}
backend/drizzle/seed.ts                     # one fixture entry per tenant (FR-021)
backend/drizzle/demo/time-entries.ts        # generator (FR-022, Decision 11)
backend/drizzle/seed-demo.ts                # writes it
frontend/src/time/{types,api,duration,range,schema}.ts
frontend/src/app/horas/{page,TimesheetView,TimerCard,LogTimeDialog,CorrectEntryDialog,VoidEntryDialog}.tsx
frontend/src/{authz/capability-matrix.ts, configuracion/matrix-view-model.ts, shell/navigation-items.ts}
```

## Naming, found during implementation

The capability ids are `time.log`, `time.read_own`, `time.correct_own` and `time.discard_timer` —
**not** `time_entry.*`, as the first draft of this plan had them. `registry-shape.test.ts` requires
every capability id to match `^[a-z]+\.[a-z_]+$`: the module half admits no underscore. The audit
vocabulary has no such rule (`document_category.created` already exists), so the six actions keep
the table's name, `time_entry.*`. Recorded rather than silently fixed, because the ids appear in
spec.md's matrix and a reader comparing the two would otherwise find a contradiction.

## Coverage

`vitest.config.ts` gains a 100% threshold (statements, branches, functions, lines) on
`src/modules/time-entries/duration.ts` — the constitution's "fee and billable-hour calculation"
entry, scoped to the one file that calculates, exactly as `006` scoped its threshold to the resolver
file rather than the whole module. The frontend's `src/time/duration.ts` is held to the same bar in
its own unit test (every branch asserted).

## Constitution Check

| Principle | How | Status |
|---|---|---|
| I — Spec first | spec → plan → tasks; catalog amended in the same PR (US03, US10, US11, item 7) | ✅ |
| II — Isolation | RLS forced, null-safe policy, `TENANT_SCOPED_TABLES`, fixture for `no-context`; `time-entries-isolation.test.ts`: firm B never reads firm A, unassigned AA never sees an entry, cross-tenant `404` on every route | ✅ |
| III — Core vs tenant | no firm-specific rule; units and day are product-wide | ✅ |
| IV — Least privilege | rows 48–51, four holders, BM/SA/PO/portal none; writes through the resolver; matrix tests and frontend mirror | ✅ |
| V — Auditable | six actions, one per mutation, `CHECK` re-issued in `0048`; no `DELETE` grant | ✅ |
| VI — Compliance | minimisation (no BM read, no values in audit metadata, no client name in responses) | ✅ |
| Tier entitlements | cross-cutting, no tier key (every plan records time) | ✅ |
| Strict TDD | every implementation task preceded by a failing test task (tasks.md) | ✅ |
| Critical coverage | `duration.ts` at 100%, blocking | ✅ |

No violations; Complexity Tracking is empty.

## Complexity Tracking

*None.*
