# Phase 0 — Research: Frontend Application Shell

**Feature**: `016a-frontend-shell` | **Date**: 2026-08-26
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Constitution**: v1.4.0

Every decision below was checked against `004/spec.md`, `004/contracts/refusal.md` and
`002/spec.md` as they stand on `main`, not against assumption. Where a decision found the
backend's actual wire shape gives less than the spec asks for, that gap is recorded, not
smoothed over.

---

## D1 — The Capability Matrix mirror: a checked-in constant plus a sync test

**Decision.** `frontend/src/authz/capability-matrix.ts` is a hand-maintained TypeScript
constant — `Record<NavigationCapabilityId, ReadonlySet<Archetype>>` — covering exactly
the rows this shell's navigation items reference, not all 21 of 004's rows. A unit test
(`tests/unit/capability-matrix-sync.test.ts`) reads `004/spec.md`'s Capability Matrix
table as fixture data (a small hand-transcribed constant of its own, dated against the
same commit) and asserts equality, row by row, for every id this shell's file declares.

**Rationale.** FR-025 requires a build-time correspondence, not a runtime call — 004's
matrix is a compile-time constant (Decision 4) with no endpoint that answers "what may
this archetype see," and building one would hand 004 a UI concern its own Out of Scope
disclaims. A generated file (codegen reading `backend/src/common/authz/matrix.ts`
directly) was considered and rejected for this slice: it would create a build-time
coupling from `frontend/` to `backend/`'s source tree, which the two independent
`package.json`s (plan.md, Structure Decision) do not otherwise have, for a table that
changes only when a domain slice ships — infrequently enough that a test catching drift
at PR time is sufficient, per FR-025's own words: "a mismatch... is a defect in this
slice, never a second source of truth." The sync test is what makes that defect loud
rather than latent.

**Consequence.** Every domain slice that adds a navigation item edits two files in the
same PR — its own screen, and one row of `capability-matrix.ts` — exactly mirroring how
004 itself requires a capability's `MATRIX` row to land in the same change as its
registration (`004/contracts/refusal.md` §5).

**Alternatives considered.**

| Candidate | Why rejected |
|---|---|
| Runtime call to a hypothetical backend endpoint | 004 exposes none, deliberately (Out of Scope); building one duplicates a decision already made once. |
| Codegen from `backend/src/common/authz/matrix.ts` at `frontend/` build time | Couples two independently-versioned `package.json`s' build graphs for a table that changes rarely; a test is cheaper and equally loud. |
| No sync check, trust manual review | Exactly the *developer forgets it* failure mode the constitution's tenant-isolation rationale (Principle II) warns about, applied here to Principle IV instead — a stale mirror silently hides or exposes an item with no build signal. |

---

## D2 — Tenant switching is a client-side pointer change, not a new endpoint

**Decision.** "Switching the active tenant" (US2, FR-009 to FR-012) never calls a
dedicated backend endpoint. `002/spec.md` FR-013 to FR-018 already verify a named tenant
on **every** request via the `x-tenant-id` header (`002/spec.md` User Story: "Given an
authenticated identity holding no membership in the named tenant… refused, indistinguish-
able from the tenant not existing"). The switcher:

1. Reads the identity's live memberships from `GET /identity/memberships` (002, FR-017) —
   the same enumeration the identity-surface already exposes, `self`-scoped, no archetype
   check (004, research.md D8).
2. On selection, writes the chosen tenant id to the active-tenant cookie (plan.md,
   Technical Context) and invalidates every TanStack Query cache entry keyed to the
   previous tenant, so the content region re-fetches under the new `x-tenant-id` rather
   than serving stale cached data (FR-011's "zero records from the previously active
   tenant").
3. The **verification** that the chosen tenant is one the identity actually holds a live
   membership in happens exactly where it always has — inside `resolvePrincipal`, on the
   very next tenant-scoped request — never client-side. An attempt to select a tenant with
   no live membership therefore surfaces as an ordinary refused request (FR-012), routed
   through the same Opaque bucket as any other cross-tenant attempt (D3 below), not as a
   distinct "invalid selection" UI state.

**Rationale.** FR-009 says this control must *invoke* 002's existing resolution, not
reimplement it — there is no other resolution to invoke than "send this tenant id on the
next request and see what comes back." Any client-side pre-check ("is this tenant in my
memberships list, so I can show a nicer error before sending") would duplicate FR-012's
own verification and risks drifting from it, which is the antipattern FR-005 and FR-022
exist to keep out of this slice entirely.

**Alternatives considered.** A dedicated `POST /session/active-tenant` endpoint that
verifies and returns a session token pinning the tenant server-side — rejected: it would
introduce server-side session state this architecture does not otherwise have (every
tenant-scoped request is independently verified per 002/FR-013), for a guarantee the
per-request check already provides.

---

## D3 — The opaque/distinguishable bucket mapping, and where it falls short of the spec's own ambition

**Decision.** `frontend/src/feedback/refusal-bucket.ts` classifies a failed response by
`(status, error.code)` alone, against the wire table `004/contracts/refusal.md` §2
already fixes:

| `status` | `error.code` | Bucket | Copy |
|---|---|---|---|
| 404 | `not_found` | **Opaque** | Generic "no se pudo completar" + retry |
| 403 | `mfa_enrollment_required` | **Opaque** *(explicit override — see below)* | Same generic copy |
| 403 | `not_authorized` | **Distinguishable — role** | "Tu rol no permite esto" |
| 403 | `entitlement_required` | **Distinguishable — plan (feature)** | "Tu plan no incluye esto" |
| 403 | `limit_reached` | **Distinguishable — plan (limit)** | "Se alcanzó el límite de tu plan" |
| network failure / 5xx / no response | *(none)* | **Opaque, no security cause** | Generic retry copy, per FR-024's last sentence |

`mfa_enrollment_required` carries a real, distinct code at the wire level — 002 gives it
one deliberately, because reaching it already proves a genuine live membership
(`002/plan.md`). This slice's own spec (`spec.md` User Story 4, scenario 7) nonetheless
requires it rendered in the **Opaque** bucket, ahead of every distinction 004's Refusal
Ordering would otherwise permit. The classifier honours that as a named, deliberate
exception, not an oversight — its own code comment cites this decision so a future reader
does not "fix" it back into the Distinguishable bucket.

**Where this falls short, honestly.** `spec.md` User Story 4 scenario 5 asks for scope
refusals to render distinct copy ("no estás asignado a esto") from permission refusals
("tu rol no permite esto"). At 004's **currently shipped** wire mapping
(`004/contracts/refusal.md` §2), a `scope` refusal at `self` kind and a `permission`
refusal are **wire-identical** — both `403 not_authorized`, with nothing in the body to
tell them apart. A `scope` refusal at `assigned` kind maps to `404 not_found`,
**deliberately** identical to the Opaque bucket, per 004's own research.md D6 (an
`assigned` refusal must not confirm a matter exists, which a distinguishable 403 would).
And critically: **no capability in 004's registry resolves at `assigned` scope today**
(004/data-model.md — rows 1–8 are `tenant`, 9–10 are `self`, 11–17 are `none`), so the
scope bucket is not reachable through any real backend response yet, in either shape.

**Resolution taken for this slice.** `refusal-bucket.ts` classifies a bare
`403 not_authorized` as the **role** bucket, since that is 004's own predominant case
today and is what the wire signal actually supports. A `scope` classification exists in
the type (`RefusalBucket = 'opaque' | 'role' | 'entitlement'`, with room for a future
`'scope'` variant) but nothing in this slice's own wire-mapping code can produce it yet —
it is left for the slice that ships the first `assigned` capability, at which point
004's own Open Item 3 (403 vs 404 for `assigned`) must also resolve, and this file's
table gains a row. Recorded here, and in `spec.md`'s Approval Checklist via the existing
"004's Out of Scope note… reconciled" item, rather than silently building a distinction
the backend cannot yet back up.

**Consequence for `spec.md` scenario 5 and SC-013.** Both are satisfied **today** only
in the degenerate case (no `assigned`-scope capability exists to fail the assertion
against); both become fully testable the moment 004 ships its first `assigned` row and
its Open Item 3 answer. This plan does not treat that as blocking 016a — the mechanism,
type and test scaffold ship now, exactly the posture 004 itself took for the same
resolver (004/spec.md User Story 5).

---

## D4 — Loading threshold and minimum display duration

**Decision.** Two independent timers, not one:

- **Minimum display duration (120ms).** A loading indicator that would appear and
  resolve inside 120ms never appears at all — TanStack Query's own `pending` state is
  gated behind a short debounce before `LoadingState` mounts. This is the answer to the
  edge case "does the loading indicator flash on and off": it does not, because it is
  never shown for a request fast enough to flash.
- **Error threshold (10 seconds).** A request still `pending` after 10 seconds
  transitions the region to the error state (FR-013's "past a defined threshold"), via
  TanStack Query's own request timeout rather than a bespoke timer, so retry (FR-015)
  re-issues through the identical code path an ordinary failure does.

**Rationale.** Two different failure modes, two different constants: a debounce prevents
visual noise on the fast path; a timeout prevents an indefinite spinner on the slow or
hung path. Collapsing them into one number (e.g., "show loading after 0ms, error after
10s") would flash on every fast request, which SC-004/SC-006's language ("0 blank
regions", visually distinguishable states) implicitly forbids by requiring each state to
read as deliberate, not as UI noise.

**Alternatives considered.** No minimum display duration — rejected: the edge case is
explicitly asked in spec.md and a flash reads as broken rather than fast. A single
combined threshold — rejected for conflating two unrelated constants tuned for opposite
goals (suppress vs. force a transition).

---

## D5 — The principal fixture

**Decision.** `frontend/src/session/principal.ts` exports a `getPrincipal()` seam
returning `{ identityId, memberships: { tenantId, tenantName, archetype }[] }`, backed in
this slice by a fixture module reading a small, checked-in JSON file
(`frontend/src/session/principal.fixture.json`) rather than any authentication flow — the
same "fixture until slice 003 replaces it" posture `001-tenant-foundation` took before
`002` supplied real identity data (plan.md's own precedent, cited in spec.md
Assumptions).

**Rationale.** FR-023 forbids this slice from performing authentication; the fixture
must therefore look, to every consumer, exactly like whatever slice 003 will hand it —
one function, one return shape — so that slice 003's own plan.md can replace the fixture
module alone and touch nothing in `src/shell/`, `src/feedback/` or `src/authz/`.

**Alternatives considered.** Hardcoding a principal directly inside `layout.tsx` —
rejected: it would leak the fixture's shape into a component every later slice imports
from, instead of confining the seam to one file slice 003 swaps out.

---

## D6 — Test split: unit / component / e2e, and where TDD exemption 4 applies

**Decision.**

- **`tests/unit/`** — no DOM, no network: `capability-matrix-sync`, `refusal-bucket`,
  `navigation-items` filtering logic, the active-tenant cookie read/write. Vitest.
- **`tests/component/`** — React Testing Library against a mocked `QueryClient`:
  `QueryBoundary`'s three-state switch (FR-019), `ErrorState`'s bucket-driven copy,
  `TenantSwitcher`'s permitted-tenant list and the zero-membership-control case (FR-010).
- **`tests/e2e/`** — Playwright, real browser, both the desktop and mobile-sized
  viewports SC-011 names explicitly: the full shell render, a tenant switch completing
  within 2 seconds (SC-007), and the loading→content / loading→error / loading→empty
  transitions actually painting.

**TDD exemption 4** (constitution: "purely visual adjustments without logic — styles,
copy, layout") covers the shell's CSS, spacing and the Spanish copy strings themselves,
not the logic that selects which copy or which component renders. Every file under
`src/authz/`, `src/feedback/` (excluding the copy strings) and `src/session/` is
test-first; Tailwind classes and layout markup are not.

**Rationale.** Mirrors `backend/`'s own three-tier split (`tests/unit`, `tests/contract`,
`tests/integration`) in spirit — different names because a frontend has no "contract"
tier in the backend's sense, but the same underlying question at each tier: unit asks "is
this pure function correct," component asks "does this piece render correctly against a
controlled fake," e2e asks "does this work in an actual browser at an actual viewport
size," which nothing short of a real browser can honestly answer (SC-011).
