# Quickstart Results — The Firm's Calendar

**Feature**: `013-calendar-core` | **Validated**: 2026-09-23 | by the implementer (Claude)

## Automated gates

| Gate | Result |
|---|---|
| Backend `check:env`, lint, typecheck, `npm test -- --coverage` | ✅ 187 files, 1,805 tests, thresholds met |
| Isolation, RLS coverage, role (inside the suite) | ✅ incl. `calendar-isolation.test.ts` (8) and `calendar_event` in `rls-coverage` / `no-context` |
| Frontend `npm test`, typecheck, lint, build | ✅ 75 files, 639 tests; `/calendario` built |
| Colour literals in new files | ✅ 0 |
| `tests/e2e/calendario.spec.ts` (desktop, live backend) | ✅ 5/5 in 12.5 s |

## Scenarios

| Scenario | Result |
|---|---|
| Navigation → `/calendario`; month grid; today marked | ✅ e2e + component |
| Create a hearing linked to a case; listed with time and case link | ✅ e2e |
| Edit its time | ✅ e2e (audit names fields only: contract test) |
| Cancel (confirmed, kept, shown with "Mostrar cancelados") | ✅ e2e |
| All-day deadline with a reminder appears in "Recordatorios" | ✅ e2e |
| An AA never receives a case event they are not on; firm B never sees firm A | ✅ integration (`calendar-isolation`) |
| Mexico City day boundaries (21:00 on 30 Sept is September) | ✅ contract test |
| BM: no navigation item, API `403`, screen says so | ✅ component + contract |
| Mobile viewport | ❌ **not run** |

## Deviations from the spec

- **FR-013's navigation badge is not built.** The reminder count is shown at the top of
  `/calendario` instead. A count in the shared navigation would put a data fetch in the shell of
  every page; deferred until reminders have a real delivery channel (Decision 2).
- The seed now adds one firm-wide fixture event per seeded firm, for `no-context.test.ts`.

## For the CC technical lead's review

Decisions 1–5 in the spec were taken under delegation. The one with product weight is
**Decision 1**: US02 and US03 of EP05 (create, edit) moved from IT2 to MVP, because a calendar
nobody can add to is empty until court sync (IT3) exists.
