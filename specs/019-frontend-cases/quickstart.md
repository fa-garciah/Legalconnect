# Quickstart — Validating the Case Register

**Feature**: `019-frontend-cases` | **Date**: 2026-08-28
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) |
**Contracts**: [case-screens.md](./contracts/case-screens.md) ·
[case-list-filters.md](./contracts/case-list-filters.md)

A run-and-verify guide, not an implementation guide.

---

## Prerequisites

```bash
# 1. Database, migrated and seeded
cd backend
npm ci
npm run db:up && npm run db:migrate && npm run db:seed

# 2. Backend on the port the frontend expects
$env:PORT=3001; npm run dev        # bash: PORT=3001 npm run dev

# 3. Frontend, second terminal
cd frontend
npm ci
npx playwright install chromium    # NOT installed by npm ci — every e2e fails without it
npm run dev
```

**Port 3001 is not arbitrary.** `api-client.ts` defaults to it and `next dev` takes 3000.
Both on 3000 means the frontend calls itself.

**Who you are while testing.** No login until slice `003`. The frontend reads
`src/session/principal.fixture.json`, which ships with placeholder ids matching nothing —
leave it and the register renders an opaque refusal, which looks like a bug and is not. Paste
the seed's own output in:

```bash
cd backend && npm run db:seed
# SEED_TENANT_A=<tenant uuid>
# seeded identity dual -> <identity uuid> (membership A …, membership B …)
```

Then set `identityId`, the membership's `tenantId`, and `archetype` to whichever role the row
under test needs. **Changing that one field is how every permission row below is exercised.**

**The seed already has what this slice needs**: three matters per tenant — one the seeded
membership is assigned to, one unassigned, one unstaffed — printed as
`SEED_CASE_ASSIGNED_A`, `SEED_CASE_UNASSIGNED_A`, `SEED_CASE_UNSTAFFED_A`. The unassigned one
is the fixture for every opacity check.

---

## Scenario 0 — The backend change, before any screen

**Run this first.** Every scenario below reads through the filters, so a fault here explains
faults everywhere else.

```bash
cd backend
npx vitest run tests/integration/case-filter-scoping.test.ts
npx vitest run tests/contract/case-list-filters.test.ts
npx vitest run tests/integration/case-list-scoping.test.ts   # 006's, must still pass
```

| Step | Expected |
|---|---|
| `q` matching a file number | Only matching matters |
| `q` matching a client's legal name | Only matching matters — `q` covers both fields |
| `q` of only whitespace | Treated as absent; the whole register returns |
| `matterTypeId` and `venueId` together | The intersection |
| An unknown catalog id | `200` with zero items — **not** a refusal, so the id cannot be probed |
| A malformed uuid | `400 validation_failed` |
| **`q` matching an unassigned matter, as `AA`** | **Zero items.** The row this slice's risk lives on |
| Every filter, in every combination, as `AA` | Never the unassigned matter |
| The same, as `MP` | Every matching matter in the tenant — the filters must not hide what `MP` is entitled to |
| A filtered page with more remaining | A **full** page, not a short one |
| `006`'s own scoping test | Passes unchanged |

**The row worth dwelling on** is the unassigned-matter one. A missing pair of parentheses in
the `q` predicate turns `AND (a OR b)` into `(AND a) OR b`, and the second branch has no
assignment predicate — every matching matter in the tenant is returned to a caller assigned
to none of them. It returns a **superset**, so every "did I get the right rows" test still
passes. This is the only test that fails.

---

## Scenario 1 — See the register (US1, FR-001 to FR-008)

```bash
cd frontend
npx vitest run tests/component/expedientes/CaseRegister.test.tsx
npx playwright test tests/e2e/case-register.spec.ts
```

| Step | Expected |
|---|---|
| Open `/expedientes` as `MP` | Every matter in the tenant, six columns populated |
| As `AA` assigned to one | Exactly that one, and nothing hinting others exist |
| As `PL` assigned to nothing | An empty state saying **you have none assigned** — not an error, not a refusal |
| As `MP` in a firm with no matters | A **different** empty state: the firm has none |
| As `BM` | The navigation entry is absent, and the route refuses |
| A matter with no type and no venue | `—` in both cells, not blank |
| A matter opened 2026-03-04 | Renders **04/03/2026** — never 03/03 |
| A closing status vs an open one | Visibly different badges |
| Every badge, catalog read failing | All neutral; the register still renders |
| More matters than one page | "Cargar más"; the next page continues the same set |
| Type a fragment quickly | **One** request after the typing settles |
| Clear the search box | The whole register returns |
| Change a filter while on page 2 | Cursor resets; paging restarts in the new filter |
| Backend stopped | Error state with retry, no permission or plan cause implied |
| **Load a register of fifty** | **Zero** audit entries |

**The date row is not padding.** `new Date('2026-03-04')` is UTC midnight; rendered in Mexico
City that is 3 March. Every opening date in the register would be a day early, and only for
users west of Greenwich — correct on a European developer's screen, wrong on every real one.

---

## Scenario 2 — Open one matter (US2, FR-009 to FR-012)

```bash
npx vitest run tests/component/expedientes/CaseDetailPanel.test.tsx
```

| Step | Expected |
|---|---|
| Open a matter you are on | The record, plus the live team with each role |
| A matter with an empty team | *Sin asignar* — a legitimate state, not an error, not blank |
| A matter whose type was retired | Still resolves, marked retired |
| **A fabricated case id** | Some rendering |
| **A real matter you are not on** | **Byte-identically the same rendering** — same words, same shape, no control present in one and absent in the other |
| Open one matter | **Exactly one** audit entry |
| Alt-tab away and back | **Still one.** No refetch on window focus |
| Close the panel | The register's filter, page and scroll position all intact |
| Close with **Escape** | Focus returns to the row control that opened it |

**The two 404 rows are the point of this slice.** `004` declared the `assigned` scope, `006`
implemented its opacity, and every test of it so far has compared response bodies. These two
rows are the first time anyone checks that it reads the same to a person.

---

## Scenario 3 — Record a new matter (US3, FR-034 to FR-040)

```bash
npx vitest run tests/unit/case-schema.test.ts tests/component/expedientes/CaseFormDialog.test.tsx
```

| Step | Expected |
|---|---|
| Open the form | No errors — nothing has been touched |
| Submit it empty | Every problem at once, in Spanish, and **no request sent** |
| The client field | A searching picker; typing narrows it server-side |
| The three catalog selects | **Active entries only** — a retired type is not offered |
| Save a valid matter | Dialog closes; it appears in the register with no manual reload |
| The new matter's team | *Sin asignar*. Creation assigns nobody, deliberately |
| A file number the firm already uses | `409` against the file-number field, everything typed preserved |
| A client withdrawn since the picker loaded | `422` against the client field, picker refreshed, and **no hint** whether that client exists elsewhere |
| A matter with no venue | Accepted — a consultative matter is heard nowhere |
| The closing date | **No field for it** |
| As `AA` or `PL` | No create control, and the route refuses if called anyway |

---

## Scenario 4 — Move a matter forward (US4, FR-013 to FR-016)

| Step | Expected |
|---|---|
| Change the status | The register reflects it with no manual reload |
| Apply a status the firm marked as closing | A closing date appears that nobody typed |
| Move back to an open status | The closing date clears |
| Apply the status it already has | Refused and said plainly — the audit log gains no no-op |
| As `PL` | No status control offered; the route refuses if called anyway |
| As `AA` on a matter they are not on | `404`, indistinguishable from a matter that does not exist |

---

## Scenario 5 — Permissions at the surface (FR-017 to FR-019, SC-006)

```bash
npx vitest run tests/component/expedientes/control-visibility.test.tsx tests/unit/capability-matrix-sync.test.ts
npx playwright test tests/e2e/hidden-item-still-refused.spec.ts   # 016a's
```

| Step | Expected |
|---|---|
| Each of the six internal archetypes | Controls match that archetype's row exactly — none shown the server would refuse, none hidden it would permit |
| `PL` | Register and open, no create, no status change |
| `AA` | Register, open, status change; no create |
| `CM` | All four |
| `BM` | **Nothing.** No navigation entry, no register |
| The navigation entry's archetypes | The five holding `case.read_list`. **`BM` must have been removed** — it was left in by `018`'s placeholder entry |
| The mirror disagreeing with `006` | Build fails |
| A hidden control's request issued directly | Refused identically to the case where it was never hidden |

**The `BM` row is a real correction, not a check.** `018` added the `expedientes` placeholder
with all six internal archetypes because no capability existed to narrow it against. One
does now, and `BM` is not on it.

---

## Scenario 6 — Nothing that already worked stopped working

```bash
cd frontend && npx vitest run && npm run lint && npx tsc --noEmit
cd ../backend && npm test
```

| Step | Expected |
|---|---|
| The frontend suite | Passes; `018`'s and `016a`'s tests unchanged |
| The backend suite | Passes, including `006`'s own case tests unchanged |
| `refusal-bucket.ts`, `api-client.ts`, the feedback components | `git diff` empty |
| `spanish-copy.test.tsx` | Passes with this slice's components added |
| Colour literals in new files | **Zero** |
| Both viewports, `/expedientes` and its panel and dialogs | No horizontal page scrolling |

---

## Known-not-covered

Recorded so the gaps are visible rather than assumed absent.

- **No Abogado column.** No person's name exists in the system (spec Q2). Returns with `003`.
- **No urgency badge.** `006` has nowhere to hold urgency; `US05-EP02-CSM` stays unclaimed.
- **No sorting.** Same server-side constraint the filters had; not asked for.
- **No team management.** `006` shipped the routes; this slice displays the team and does not
  edit it. `US14-EP02-CSM` stays unclaimed — and it is where the `assigned` scope's second
  property becomes interesting: you must be on a matter to change who else is.
- **No editing a matter's client, number, type or venue.** `006` ships no update route.
- **No deadlines, tasks, activity feed or client-facing report.** `US09`–`US13` need entities
  no shipped slice owns.
- **No shareable link to one matter.** The accepted cost of the panel (contract §2).
- **The `q` placeholder no longer says "o descripción".** A case has no description in `006`;
  the design's placeholder was corrected rather than the schema extended.
