# Quickstart — Dashboard Principal

## Prerequisites

A disposable Postgres migrated and seeded (`npm run db:migrate && npm run db:seed && npm run db:seed:demo`),
backend on 3001, frontend on 3000.

## Scenarios

1. **Backend**: `npx vitest run tests/contract/dashboard.test.ts tests/integration/isolation/dashboard-isolation.test.ts`
   — every section, reach, zeros for a person with no assignments, `SA` without hours, `BM` 403, no
   audit row, no metadata/revenue in the JSON.
2. **Matrix**: `npx vitest run tests/unit/matrix-exhaustive.test.ts tests/unit/registry-shape.test.ts`
   — row 56.
3. **Frontend**: `npx vitest run tests/component/dashboard` — tiles per archetype; `BM` makes no request;
   the past-deadline sentence; the `/kpis` link only with `kpi.read`.
4. **By hand / e2e** (`tests/e2e/dashboard.spec.ts`, desktop): sign in as the demo MP; `/` shows
   "Expedientes activos", today's events, deadlines and — after writing a note — that note in
   "Actividad reciente" with no note text.
