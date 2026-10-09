# Implementation Plan: Dashboard Principal

**Branch**: `024-dashboard-principal` (stacked on `008-notes-and-activity`) | **Date**: 2026-10-09 |
**Spec**: [spec.md](./spec.md) | **Contract**: [contracts/dashboard-api.md](./contracts/dashboard-api.md)

## Summary

One read route (`GET /tenant/dashboard`), one capability row (56), no migration, no audit action. A
backend module `modules/dashboard` composes five sections from existing tables in one transaction,
each narrowed to the matters the caller reaches. `/` replaces `016a`'s placeholder with the
dashboard. The activity derivation of `008` is extracted into a function both slices call.

## Technical Context

**Language/Version**: TypeScript 5 (Node 22) — NestJS backend, Next.js frontend.
**Primary Dependencies**: existing only.
**Storage**: PostgreSQL 16 with RLS; **no migration**. Reads `case_file`, `case_status`,
`case_assignment`, `calendar_event`, `time_entry`, `audit_event` (+ `document`, `case_note`,
`directory_entry`, `position` for the feed).
**Testing**: Vitest unit / contract / integration; Testing Library; Playwright.
**Constraints**: Principle II (RLS; narrowing in every query; no route takes an id), IV (row 56),
V (a read — nothing recorded, Decision 5), VI (no metadata values, no email, no revenue).

## Route

| Method & path | Capability (row) | Scope | Audit |
|---|---|---|---|
| `GET /tenant/dashboard` | `dashboard.read` (56) | `tenant`, narrowed in query | — |

The route names no id, so it is not a foreign-reference probe; the isolation test covers it.

## Where each rule lives

| Rule | Where |
|---|---|
| Reach (MP/SA all; others live assignment) | `dashboard.repository.ts` `reachable(alias)` — ONE parenthesised predicate, as 009 |
| Active = status not closing | `dashboard.repository.ts` `activeMatters` (015's definition) |
| Today / ±7 days, Mexico City | SQL `now() AT TIME ZONE 'America/Mexico_City'` (Decision 7) |
| Own hours only, timekeepers only | service: `MATRIX['time.read_own']` → `null` otherwise; SQL `membership_id = caller` |
| Activity allow-list and membership rule | `modules/notes/activity-query.ts` (extracted from 008's repository, shared) |
| No values in the feed | the shared SELECT never selects `metadata` |
| Who may call | `dashboard.read` row 56 via the global `AuthorizationInterceptor` |
| BM makes no request | `DashboardView` checks `can('dashboard.read')` before mounting the query |

## Structure

```text
backend/src/modules/dashboard/{dashboard.controller,dashboard.service,dashboard.repository,dashboard.module}.ts
backend/src/modules/notes/activity-query.ts            (shared activity SELECT, from 008)
backend/src/common/authz/{capability,matrix}.ts         (row 56)
backend/tests/contract/dashboard.test.ts
backend/tests/integration/isolation/dashboard-isolation.test.ts
frontend/src/dashboard/{types,api}.ts
frontend/src/app/page.tsx, frontend/src/app/DashboardView.tsx
frontend/src/{authz/capability-matrix.ts, configuracion/matrix-view-model.ts}
frontend/tests/component/dashboard/DashboardView.test.tsx
frontend/tests/e2e/dashboard.spec.ts
```

## Coverage

Matrix rows + `matrix-exhaustive` (56) + registry-shape + capability-declared-everywhere; contract
test per section; isolation test (AA vs an unassigned matter carrying an event, a deadline, hours and
activity; firm B); whole-JSON scan for metadata/revenue words; component tests per archetype; one
e2e.

## Constitution Check

| Principle | How | ✅ |
|---|---|---|
| I Spec-first | spec + 8 Decisions pending ratification; pushed, not merged | ✅ |
| II Isolation | RLS; reach narrowed in every query; isolation test | ✅ |
| IV Matrix | row 56 + frontend mirror; tests | ✅ |
| V Audit | read, not audited — Decision 5 | ✅ |
| VI Minimisation | no metadata values, no email, no revenue | ✅ |
