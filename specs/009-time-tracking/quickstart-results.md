# Quickstart Results — Recording Time

**Feature**: `009-time-tracking` | **Validated**: 2026-10-08 | by the implementer (Claude, Opus 5.5)
**Environment**: Windows 11, Docker Desktop 29.4.3, PostgreSQL 16 (`legalconnect-db`, host port
5455 per the local, uncommitted `docker-compose.override.yml`), MinIO from the locally cached
`minio/minio:latest` image (the override disables the pinned quay.io image, which returns 401).

## Automated gates

| Gate | Result |
|---|---|
| Backend `check:env`, `lint`, `typecheck` | ✅ clean |
| Backend `npm test -- --coverage`, all files | ⚠️ **219 files: 2,319 + 25 passed, 3 failed — all three pre-existing on `main`, none in a file this slice owns** (see below) |
| Backend coverage thresholds | ✅ met — run with the two pre-existing-failure files excluded (217 files, 2,319 tests, exit 0), because vitest prints no coverage report when any test fails. `src/modules/time-entries/duration.ts` **100 / 100 / 100 / 100** (FR-020); `src/common/authz` 100% |
| `test:isolation` | ✅ 15 files, 96 tests (incl. `time-entries-isolation.test.ts`, 9) |
| `test:rls` | ✅ 35 tests (`time_entry` covered) |
| `verify:role` | ✅ 4 tests |
| `test:auth-coverage` | ✅ 4 files, 32 tests |
| Frontend `npm test` | ✅ 91 files, 779 tests — **three consecutive green runs** (see "Flakiness" below) |
| Frontend `typecheck`, `lint` | ✅ clean |
| Frontend `build` | ✅ `/horas` built |
| Colour literals in new files (`src/app/horas/*`, `src/time/*`) | ✅ 0 |
| e2e `tests/e2e/horas.spec.ts` (desktop, live backend, demo firm) | ✅ 6/6 (AA Jorge González; BM Sergio Pantoja) |

### This slice's own tests

| Suite | Tests |
|---|---|
| `tests/unit/time-entry-duration.test.ts` | 16 |
| `tests/unit/time-entry-input.test.ts` | 24 |
| `tests/unit/time-entry-audit-actions.test.ts` | 7 |
| `tests/unit/demo-time-entries.test.ts` | 14 |
| `tests/integration/time-entry-constraints.test.ts` | 16 |
| `tests/integration/isolation/time-entries-isolation.test.ts` | 9 |
| `tests/contract/time-entries-{timer,manual,timesheet,correction}.test.ts` | 15 + 11 + 9 + 11 |
| `tests/integration/demo-seed.test.ts` — three new assertions + the idempotency fingerprint | 3 |
| Frontend unit `tests/unit/time/*` | 23 |
| Frontend component `tests/component/horas/*` | 22 |
| Frontend `spanish-copy.test.tsx` — four new cases | 4 |
| e2e `tests/e2e/horas.spec.ts` | 6 |

## Failures NOT caused by this slice — present on `main` before the first edit

The baseline was taken on `main` (`9f4a1ad`) before any change: **2,145 passed, 3 failed**.

| Test | Cause, as far as established |
|---|---|
| `demo-seed.test.ts` › "writes about 130 documents" and "wrote the metadata rows either way" (149 vs 130, 154 vs 135) | **Accumulation across re-seeds on different days.** Document ids are keyed on the matter's file number, and file numbers are generated from the seed date, so a database re-seeded on another day gains a second generation of documents. Verified in the database: 149 distinct documents, `uploaded_at` spanning 2025-06-01 to 2026-09-30. `022`'s idempotency holds within a day, not across days. `drizzle/demo/time-entries.ts` deliberately does not repeat it (date-free ids). Not fixed here: it is `022`'s. |
| `documents-upload-cap.test.ts` › "a file at the limit is accepted" (413 vs 201) | With the cap set to 1024 bytes the test sends exactly 1024 bytes and receives 413 — the at-limit semantics of multer/busboy's `fileSize`. Not environmental: it still fails after `DOCUMENT_MAX_UPLOAD_BYTES` was copied into the local `.env` (which `check:env` had flagged). `021`'s. |
| e2e `shell-render.spec.ts` (016a) | Visits `/` **without signing in**, lands on `/ingresar` (snapshot confirms), and looks for the shell header. Written before authentication gated the shell. Not verified against `main` in a browser, but the failure is independent of any file this slice touched. |

## Scenarios (quickstart.md)

| # | Result | How |
|---|---|---|
| Q1 | ✅ | e2e (nav link → `/horas`, total visible) and screenshot — as Jorge González (AA), not Laura Ramírez: she belongs to two firms and the firm picker is not what this checks |
| Q2 | ✅ | e2e: timer survives `page.reload()` |
| Q3 | ✅ | e2e: stop with description → entry under today, "Cronómetro" |
| Q4 | ⚠️ partly | Second start → `409 timer_running` asserted by contract test (incl. two **concurrent** starts) and by the component test's Spanish copy; **not** exercised with two real browser tabs |
| Q5 | ✅ | e2e (dated today, not yesterday) |
| Q6 | ✅ component, ❌ not in a browser | `LogTimeDialog.test.tsx` refuses future / zero / > 24 h / blank before sending |
| Q7 | ✅ | e2e correction to 45 min; contract test asserts the audit row is exactly `{"changed":["minutes"]}` |
| Q8 | ✅ | e2e void; contract test asserts the row is kept with `voided_at` |
| Q9 | ✅ component + contract | `correctableUntil: null` hides both controls; not checked visually |
| Q10 | ✅ component | presets request the right `[from, to)`; 70 days refused before sending |
| Q11 | ✅ integration | `time-entries-isolation.test.ts`: MP sees own entries on any matter, nobody else's; not in a browser |
| Q12 | ✅ BM in e2e; SA by contract (403) and component | SA not signed in through a browser |
| Q13 | ✅ integration | unassigned PL: list, `totalMinutes` and `days` all drop the entry on the next request |
| Q14 | ✅ unit | `/configuracion` view model has a "Registro de horas" group with the four rows; not opened in a browser |
| Q15 | ✅ | 390 px: measured `scrollWidth − clientWidth = 0`, screenshot reviewed. Only the upper half of the page was captured |

## Findings during implementation

1. **Capability ids are `time.*`, not `time_entry.*`.** `registry-shape.test.ts` admits no underscore
   in a capability's module half. spec/plan/contract/tasks updated; plan.md records why.
2. **A cross-tenant existence oracle, found by the isolation test and fixed before shipping.**
   006's resolver lets `MP` through before any query (006 Decision 2), so an `MP` naming *another
   firm's* matter id reached the `INSERT`; a foreign-key check does not apply RLS, so the response
   (500 vs. 404) revealed whether the id existed elsewhere. The service now reads the matter under
   RLS first (`caseInFirm`) on every write that names one; `time-entries-isolation.test.ts` asserts
   404 for an AA and an MP, byte-identical to a non-existent id, and that nothing is written.
   Worth checking in `007`'s upload path, which relies on the same resolver — not done here.
3. **SQL precedence.** `logged_at + interval '24 hours' AT TIME ZONE 'UTC'` applies the zone to the
   interval; `iso()` now parenthesises its argument.
4. **Demo seed idempotency across days** — see the first pre-existing failure; this slice's
   generator keys ids on the working-day index, not the date.

## TDD — where the record is not as clean as the rule

- **Every test was seen failing before its implementation passed it**, with three qualifications,
  stated rather than smoothed over:
  - The service and controllers for US2–US4 (manual entry, correction, void) were written in the
    same step as US1's. Their contract tests were written afterwards; to see them fail, the four
    routes were removed, the suites run (**20 failed**), and the routes restored (**31 passed**).
  - `demo-time-entries.test.ts` was written first but first *run* after the generator existed; the
    generator was then moved aside, the test seen failing to load, and restored.
  - The four new `spanish-copy.test.tsx` cases passed on first run: they guard components that
    already existed by then. They are a regression net, not a driver.

## Flakiness observed

While the backend suite ran on the same machine, the frontend suite timed out in several files
(including `013`'s `EventDialog`, untouched here). This slice's `LogTimeDialog.test.tsx` was
hardened anyway — dates set with `fireEvent.change` instead of typing into `type="date"`, 15 s on
its two long typing tests — and the full frontend suite then passed three consecutive times with
the machine otherwise idle.

## Local environment changes (not committed)

- `backend/.env`: appended `DOCUMENT_MAX_UPLOAD_BYTES=26214400`, the exact line `check:env` printed.
- A MinIO container `lc-minio-009` from the cached `minio/minio:latest`, with the
  `legalconnect-documents-dev` bucket.
