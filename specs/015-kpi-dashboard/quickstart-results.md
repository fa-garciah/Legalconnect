# Quickstart results — `015-kpi-dashboard`

**Run**: 2026-09-26, same machine as `022` and `023` (Windows 11, Node 22.13.1, PostgreSQL 16 in
Docker on port 5455, MinIO **unavailable**, backend on 3001, frontend on 3000).

What was verified, and what was not. Nothing here is claimed from a sibling suite or a reading.

---

## Verified in a real browser, against a real database

**All six e2e tests pass** (`frontend/tests/e2e/kpis.spec.ts`, desktop project, Playwright,
against the running stack and `022`'s demo firm):

| Test | What it proves |
|---|---|
| the navigation leads there | FR-013 — the KPIs entry is a link, not the inert "Pronto" text it has been since `016a` |
| the active-matter count is a real number from the database | FR-005 — a digit, computed server-side, not a placeholder |
| the workload table names positions and never an email | Decision 10 — asserted as `body` containing no `@` at all |
| changing the period recomputes the figures | FR-014 — a `200` on `?period=year` was observed, and the active count correctly did **not** move (it is a fact about today) |
| the Asuntos tab shows the by-type breakdown, and there is no Financiero tab | Decision 2 — the absence checked against the real product, not a mock |
| **an associate cannot read them** | FR-013, Decision 4 — signed in as `AA` Laura Ramírez: **no KPIs entry in the navigation**, and typing `/kpis` renders *"Tu rol actual no permite esta acción."* with no tile rendered. The hidden link is cosmetic; the server refuses |

## The demo firm the screen was read against

Queried directly in SQL after `npm run db:seed:demo` (tenant `Despacho Méndez & Asociados`):

| | |
|---|---|
| Matters | 40 — **21 active**, 19 closed |
| Declared outcomes | **19 of 19** closed matters; none left undeclared |
| Spread | favorable 8, desfavorable 7, convenio 3, sin resolución 1 — a 58 % success rate, not a firm that wins everything |
| Closures per quarter | 1, 1, 1, 4, 3, 9 — every one of `015`'s six trend points has data |
| Workload (lead) | Asociado Senior 12, Asociado 5, Socio 3, **sin responsable 1** — visibly uneven, and it **sums to 21**, the active count |

The last line is the one worth keeping: it is the invariant that caught the defect below.

## Suites

| Gate | Result |
|---|---|
| backend `npm run typecheck` | **clean** |
| backend `npm run lint` | **clean** |
| backend `tests/unit` (whole) | **1026 passed / 53 files** |
| backend `npm run test:rls` | **33 passed** |
| backend `npm run verify:role` | **4 passed** |
| backend `npm run test:auth-coverage` | **32 passed / 4 files** |
| backend `npm run test:isolation` | **83 passed, 3 failed** — the three failures are `pre-signed-url-isolation.test.ts`, which needs MinIO |
| backend `tests/contract/kpis.test.ts` | **22 passed** |
| backend `tests/contract/case-outcome.test.ts` | **14 passed** |
| backend `tests/integration/case-outcome-constraint.test.ts` | **6 passed** |
| backend `tests/unit/kpi-period.test.ts` | **13 passed** |
| backend `tests/integration/demo-seed.test.ts` | **24 passed** |
| backend `tests/integration/audit-fields.test.ts` | **83 passed** |
| frontend `tsc --noEmit` | **clean** |
| frontend `npm run lint` | **clean** |
| frontend `npm test` | **727 passed / 83 files** (up from 678 — 49 new) |
| frontend `npm run build` | **clean**, `/kpis` in the route manifest |
| frontend e2e `kpis.spec.ts` | **6 passed** |

### T027 — `test:rls`, looked at rather than glanced at

This is the first slice since `013` to change a tenant-scoped table, so the policy was inspected
directly rather than inferred from a green suite:

```
 polname              | polcmd |                     using_expr
----------------------+--------+------------------------------------------------------------
 case_file_own_tenant | *      | (tenant_id = (NULLIF(current_setting('app.tenant_id', true), ''))::uuid)

 rls | forced          columns: outcome | case_outcome | nullable
 t   | t               constraint: case_file_outcome_requires_closed
                                   CHECK ((outcome IS NULL) OR (closed_on IS NOT NULL))
```

One `FOR ALL` policy, keyed on the row's `tenant_id` with the null-safe `NULLIF` predicate,
`FORCE` on. **The policy names no columns**, so `outcome` is covered by construction — there is
no column list anywhere that a new column could be missing from. The catalog check still passes
(33 tests).

---

## Four defects this slice's own gates found — three of them in `022`'s seed

Recorded because each was a real fault, not a test that needed relaxing. Two were found only
because `015` reads `022`'s data in a way nothing had before.

1. **The audit vocabulary census was one short.** `case.outcome_declared` took the vocabulary
   from 58 to 59. Two unit census tests had been moved; `tests/integration/audit-fields.test.ts`
   had not, because it needs a database and does not run in `test:unit`. Its title had also
   drifted ("fifty-four" while asserting 58); both are corrected.

2. **A demo matter closed nine days before it opened.** `demo-seed.test.ts` caught
   `closed_on <= opened_on` on one matter. The generator was innocent — a new unit test now
   runs it against five different clocks and finds none. The fault was the seed's upsert:
   `ON CONFLICT … DO UPDATE` listed `closed_on` but **not** `opened_on`, and the generator
   clamps a matter's opening day to the seed date, so re-seeding on a later day kept the first
   run's opening date and took the second run's closing date. Two generations spliced into one
   row, feeding a negative duration into a figure the dashboard presents as months. The upsert
   now writes the whole generated tuple.

3. **Matters with two live leads, so the workload chart over-counted.** Noticed while writing
   this file: the firm showed 33 bars' worth of matters while holding 21 active ones. The
   assignment insert was `ON CONFLICT … DO NOTHING`, so the seed only ever **added** — and
   anything that moves the RNG stream changes a matter's lead, leaving the previous run's lead
   live beside the new one. The unique index is `(case_id, membership_id) WHERE unassigned_at IS
   NULL`, so two people being live `lead` on one matter is entirely legal and the database never
   complained. `loadPerAttorney` counts one row per (matter, lead) pair, so such a matter is
   counted twice. The seed now closes assignments the current generation does not want, before
   adding the ones it does.

   **The idempotency fingerprint could not have caught this**, and that is worth knowing: it
   compares two runs of the *same* generation, while the defect only appears when the generation
   changes. Two structural invariants were added instead — at most one live lead per matter, and
   the workload attribution summing to exactly the active count.

4. **A five-step colour scale with no users.** `globals.css` gained seven chart tokens and only
   three were ever referenced; `contrast.md` went as far as documenting a sixth-series fallback
   that existed in no component. None of this slice's three charts is multi-series. The four
   speculative tokens were deleted rather than described, and the table now measures what is
   drawn: three tokens, six pairs, nothing below 5.64:1.

### A fifth, caught in the spec rather than the code

A per-group floor of five declarations made **every** bar of the by-type chart read "Datos
insuficientes" against the demo firm — a correct refusal that demonstrated nothing. The fix went
into `spec.md` first as FR-009a (the headline rate keeps its floor; the breakdown has none) and
only then into the service. A missing requirement goes into the spec, never only into the code.

---

## Not verified, and why

### `npm test` (full backend suite) — it DID run; it is red, for the same 11 files as before

*(Listed here because the gate is red, not because it was skipped.)*

**2107 passed, 26 failed, 13 skipped, across 209 files (11 failed).**

The failing eleven are byte-for-byte the set `022` established and `023` re-confirmed as
MinIO-dependent:

```
tests/contract/document-access-audited.test.ts        tests/contract/documents-upload-cap.test.ts
tests/contract/document-category.test.ts              tests/contract/documents-withdrawn-list.test.ts
tests/contract/document-read.test.ts                  tests/integration/document-category-rename.test.ts
tests/contract/document-upload.test.ts                tests/integration/isolation/object-store/pre-signed-url-isolation.test.ts
tests/contract/document-withdraw-restore.test.ts      tests/integration/storage-limit-race.test.ts
tests/contract/documents-download-disposition.test.ts
```

Same files, same 26 failures. Passing tests rose from 2029 (`023`) to **2107**. An intermediate
run of this slice showed **28** failures across **13** files; the two extra were real and are
fixed (defects 1 and 2 above). This slice introduces no new failure and fixes none of the
environmental ones: the MinIO image cannot be pulled here at all — `quay.io` answers `401` for
the pinned `minio/minio`, verified by direct `docker pull` and by a raw token request, while
Docker Hub works, so it is not a proxy.

### The coverage thresholds — **not evaluated, and it is not possible to evaluate them here**

This is worth stating precisely, because "coverage was run" would be the easy and false thing to
write.

`npm test -- --coverage` produced **no report at all** — no table, no `coverage/` directory, and
no threshold verdict. Vitest skips the coverage report when the run fails, and this run fails on
the 26 MinIO tests. Two further attempts pinned it down rather than assumed it:

1. Re-run with the eleven MinIO files excluded. Still red — **4 failures in 3 files**, all
   `expected 429 to be 201`: `enumeration-duplicate-invite`, `invitation-reissue` and
   `revoke-invitation` hit `003`'s in-memory issuance rate limiter. Removing eleven files changes
   how the rest are scheduled, so more invitations land in one window. An artefact of the
   exclusion, not a defect — those three files pass in the full run.
2. Run coverage over one green file to check the reporter itself. It printed the table and the
   threshold errors immediately, confirming the configuration is fine and a red run is the only
   reason nothing appeared.

So the blocking thresholds on `src/common/tenant/**` and `src/common/audit/**` (100 % on all four
counters) are **unverified on this machine**, as they were for `022`, and for the same root
cause. They are not verified by this slice and nothing here should be read as saying otherwise.
`015` adds no code under either path — its new code is `src/modules/kpi/**` and one route on
`case-core` — so it does not move those numbers, but that is an argument, not a measurement.

### What no one has read on this machine

- **The object-store-backed parts of the demo firm.** 135 document objects have rows and no
  bytes, so preview and download fail for them. `015` reads none of them — it counts matters,
  not documents — but the demo firm is not whole here.
- **Mobile.** `kpis.spec.ts` skips the `mobile` project: every test in it is a layout-independent
  read, and the charts' responsive behaviour at 412px has **not** been checked in a browser.
  `responsive.spec.ts` does not cover `/kpis`.
- **A second firm's figures.** Only `Despacho Méndez & Asociados` was read on screen. Tenant
  isolation of the aggregates is asserted in `tests/contract/kpis.test.ts` against a
  purpose-built second firm, not in a browser.
- **The outcome control in a browser.** `CaseOutcome.test.tsx` covers it as a component (8
  tests) and `case-outcome.test.ts` covers the endpoint (14), but no e2e walks a person through
  closing a matter and declaring how it ended. The demo firm arrives pre-declared, so the e2e
  had nothing undeclared to act on without mutating the fixture.
