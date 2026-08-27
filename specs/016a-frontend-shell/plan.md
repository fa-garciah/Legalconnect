# Implementation Plan: Frontend Application Shell

**Branch**: `016a-frontend-shell` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016a-frontend-shell/spec.md`

---

## Summary

No `frontend/` directory exists yet. This slice creates it: a persistent navigation
shell (header + menu), tenant-context display and switching over 002's existing
per-request resolution, and three feedback-state primitives (loading, error, empty)
every later screen composes with rather than reimplements. The error state additionally
draws one line this slice did not have when first drafted: 004 now ships a tested refusal
vocabulary with four ordered reasons and a wire mapping, and this shell's error state must
project that vocabulary into two buckets — opaque (indistinguishable, Principle II) and
distinguishable (004/FR-006, 004/FR-017) — rather than inventing its own copy per screen.

Technical approach: Next.js (App Router) + React, TypeScript throughout (constitution
Technology Constraints), TanStack Query as the data-fetching layer whose query-status
state machine (`pending` / `error` / `success`, `isFetching`) is the natural backing for
FR-013/FR-014/FR-017/FR-019 rather than a bespoke one. The navigation item list's
archetype requirement is sourced from `004/spec.md`'s Capability Matrix at build time
(FR-025) via a checked-in TypeScript mirror plus a sync test — never a runtime call to
the backend for something the backend itself resolved at compile time (004, Decision 4).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS — matches `backend/`'s runtime
floor (`backend/package.json` `engines.node: >=22`); no reason to diverge in the same
repository.

**Primary Dependencies**: Next.js 14+ (App Router), React 18, TanStack Query v5
(`@tanstack/react-query`) for the loading/error/empty state machine and retry (FR-013 to
FR-019), Tailwind CSS for layout and the responsive breakpoint (FR-021). No component
library is adopted wholesale — the three feedback states and the shell chrome are small,
fully-owned primitives, because their exact semantics (opaque-vs-distinguishable error
copy, mutual exclusivity, minimum display duration) are this slice's own tested contract,
not a third-party default.

**Storage**: N/A — this slice persists nothing server-side (spec.md, Key Entities). Client-
side: the active-tenant selection is held in a cookie (readable by Next.js middleware and
server components alike, surviving a reload) rather than `localStorage`, so a
server-rendered first paint already knows which tenant is active instead of flashing
unstyled/wrong-tenant content.

**Testing**: Vitest + React Testing Library for component and hook-level tests — same
runner family `backend/` already uses, so contributors context-switch tooling, not
mental models, moving between the two. Playwright for the viewport/responsive assertions
SC-011 requires (a real browser is the only honest way to assert "reachable and usable at
a mobile-sized viewport") and for the handful of true end-to-end flows (tenant switch,
navigation, retry).

**Target Platform**: Browser, responsive web only (constitution: native mobile app is an
explicit MVP prohibition). Server-rendered via Next.js on the same AWS ECS Fargate target
the constitution's Stack table names, as its own service alongside `backend/`.

**Project Type**: Web application — `backend/` + `frontend/` siblings at the repository
root, matching the plan template's Option 2 and the constitution's Stack table
(`Frontend: Next.js (React), responsive web`).

**Performance Goals**: A tenant switch reflects in the header and content within 2
seconds of completing (SC-007). No other numeric performance target is imposed by this
slice; screen-specific goals belong to the slices that build screen content.

**Constraints**: FR-005/FR-022/FR-027 — nothing in this slice may become a second
authorization authority, even accidentally, through caching or optimistic UI that outlives
a server refusal. FR-020 — all rendered copy in Spanish. TDD exemption 4 (constitution)
covers pure visual/layout work in this slice; the archetype filter, the tenant switch, and
the three feedback states' logic do not qualify for that exemption and are TDD'd fully.

**Scale/Scope**: One shell (header, menu, content region), three feedback-state
primitives, one navigation-item registry (initially covering whichever MVP modules have
shipped a screen — none yet, so the registry starts structurally correct and empty of
real entries besides itself), one tenant-switch control. Zero business screens (out of
scope). Zero new backend endpoints — every read this slice performs already exists
(`GET /identity/memberships`, and whatever a later slice's own screen calls).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Initial gate — before Phase 0

| # | Principle | Verdict | Basis |
|---|---|---|---|
| I | Spec-First Delivery (NON-NEGOTIABLE) | ✅ PASS | `US17`–`US20-EP00-FND` are the four stories this slice adds; `spec.md`'s Approval Checklist already flags the catalog addition as a blocking, not yet actioned, item — carried to this plan's Complexity Tracking as a task, not a gate failure, the same pattern 004 used for its own Decision 5. |
| II | Tenant Isolation (NON-NEGOTIABLE) | ✅ PASS | This slice reads and displays tenant context; it activates none. Every tenant-scoped read still names its tenant via the header 002 already established — this slice changes *which* tenant id is sent, never *whether* the send is verified. FR-016's opaque bucket is this principle's presentation-layer guarantee (spec.md Cross-tenant leak note). |
| III | Product Core vs. Tenant Customization | ✅ PASS | The navigation registry and the shell chrome are identical for every tenant. Nothing here reads a tenant id to change behaviour. |
| IV | Least Privilege by Default | ✅ PASS | Permission Matrix declared in spec.md. FR-005/FR-022/FR-027 make explicit, three times over, that this slice enforces nothing — it is a read of 004's decision, never a second one. |
| V | Auditability | ✅ PASS (N/A) | No mutation this slice performs is of an audited entity type — spec.md's Approval Checklist already marks this N/A, matching 004's own zero-new-audit-action posture. |
| VI | Data Minimisation | ✅ PASS | Renders identity/membership/tenant-name data slice 002 already resolved; touches no case content, no end-client PII. |

**One deviation from a template default, not from a principle**: this plan adopts
TanStack Query as a "primary dependency" though the constitution's Stack table names only
the framework (Next.js/React), not a data-fetching library. See Complexity Tracking.

### Re-check — after Phase 1 design

| # | Principle | Verdict | What the design actually does |
|---|---|---|---|
| I | Spec-First Delivery | ✅ PASS | No design artefact in Phase 1 introduces a requirement absent from `spec.md`. Where design interprets the spec — research.md D3, on the opaque/distinguishable bucket mapping — the mapping is derived mechanically from `004/contracts/refusal.md` §1–2, not invented. |
| II | Tenant Isolation | ✅ PASS | `data-model.md`'s client-side session shape carries exactly one active tenant id at a time, sourced from `GET /identity/memberships`, never inferred or defaulted. The cookie holding it is read, never trusted for authorization — every request still round-trips through 002's own verification, which can and does refuse it (FR-012). |
| III | Product Core vs. Tenant Customization | ✅ PASS | `data-model.md`'s `NavigationItem` carries no tenant identifier anywhere in its shape. |
| IV | Least Privilege by Default | ✅ **PASS — the row to watch, and it holds** | The one design decision that could have failed this row is where FR-025's "build-time correspondence" lives. It is a checked-in mirror of `004/spec.md`'s Capability Matrix (`research.md` D1) plus a sync test that fails the build the moment the two diverge — not a second, independently-maintained policy. `FR-027`'s guarantee (hiding changes nothing about what 004 permits) needed no new mechanism to prove: it already follows from FR-022, since this slice performs no capability check of its own to disable. |
| V | Auditability | ✅ PASS | Unchanged — no new audited action, confirmed again post-design. |
| VI | Data Minimisation | ✅ PASS | `data-model.md`'s client-side shapes carry identifiers and display names only. |

---

## Project Structure

### Documentation (this feature)

```text
specs/016a-frontend-shell/
├── spec.md               # amended 2026-08-26: rev. 3, Decision 1 resolved, 0 clarifications
├── plan.md                # this file
├── research.md             # Phase 0 — D1..D6
├── data-model.md            # Phase 1 — client-side shapes, no persisted entity
├── contracts/
│   └── feedback-states.md   # Phase 1 — the loading/error/empty contract every later slice consumes
├── quickstart.md            # Phase 1 — validation scenarios
├── checklists/
│   └── requirements.md      # existing
└── tasks.md                 # /speckit-tasks — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                 # root layout — mounts the shell (header + menu) around {children}
│   │   ├── page.tsx                   # redirects into the active tenant's default landing, or the
│   │   │                              #   no-active-tenant state (FR-007)
│   │   └── (shell)/…                  # route group later business slices render their screens into
│   ├── shell/
│   │   ├── Header.tsx                 # active tenant name + switch control (FR-008 to FR-012)
│   │   ├── NavigationMenu.tsx         # renders NavigationItem[] filtered by archetype (FR-002 to FR-005)
│   │   ├── TenantSwitcher.tsx         # US2 — lists 002's GET /identity/memberships, switches the cookie
│   │   └── navigation-items.ts        # the registry — data, not JSX (FR-002)
│   ├── authz/
│   │   ├── capability-matrix.ts       # FR-025 — checked-in mirror of 004/spec.md's Capability Matrix
│   │   └── capability-matrix.generated.md  # human-diffable snapshot the sync test compares against
│   ├── feedback/
│   │   ├── QueryBoundary.tsx          # FR-013/FR-017/FR-019 — one region's loading/error/empty switch
│   │   ├── LoadingState.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ErrorState.tsx             # US4 — renders from a RefusalBucket, never raw response text
│   │   └── refusal-bucket.ts          # research.md D3 — maps a failed response to Opaque | Distinguishable
│   ├── session/
│   │   ├── principal.ts               # FR-023 — supplied principal; fixture until slice 003
│   │   └── active-tenant.ts           # cookie read/write, the client-side half of FR-008 to FR-012
│   └── lib/
│       └── api-client.ts              # fetch wrapper: attaches x-identity-id/x-tenant-id, surfaces
│                                       #   004/contracts/refusal.md's wire shape to refusal-bucket.ts
└── tests/
    ├── unit/                          # navigation-items filtering, refusal-bucket mapping, capability
    │                                  #   matrix sync — no DOM, no network
    ├── component/                     # QueryBoundary, ErrorState, EmptyState, Header, TenantSwitcher —
    │                                  #   React Testing Library, mocked TanStack Query client
    └── e2e/                           # Playwright — SC-007, SC-011, the full shell-render flow
```

**Structure Decision.** `frontend/` sits beside `backend/` at the repository root, its
own Node project with its own `package.json`, matching the constitution's Stack table
and the plan template's Option 2 shape — no monorepo tool is introduced (no root
`package.json` exists today; `backend/` has never needed one). `src/shell/`,
`src/feedback/` and `src/authz/` are the three concerns spec.md separates (navigation,
feedback states, permission projection); `src/session/` is the seam slice 003 replaces
wholesale later, kept narrow on purpose so that replacement touches two files, not the
whole shell.

## Complexity Tracking

| Deviation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **TanStack Query, not named in the constitution's Stack table** | FR-013/FR-014/FR-015/FR-017/FR-019 need a `pending`/`error`/`success` state machine with built-in retry, cache-per-key invalidation (for the tenant switch, FR-011) and request de-duplication, applied identically across every later slice's screen. Hand-rolling this is exactly the kind of per-screen reimplementation FR-001's "no later slice builds its own" already forbids for navigation — the same argument applies to fetch state. Next.js and React are named; a data-fetching layer is not, because 001–004 are backend-only and never needed one. | A bespoke `useState`-based fetch hook per screen — reintroduces the fragmentation FR-019 (mutual exclusivity of the three states) exists to prevent, since every screen would own its own transition logic and its own bugs in it. |
| **A checked-in TypeScript mirror of 004's Capability Matrix, rather than a runtime call to the backend** | FR-025 explicitly requires a build-time correspondence, not a runtime one, because Decision 4 fixed 004's matrix as a compile-time constant — calling the backend for something neither side expects to change per-request would add a request to every navigation render for a value that is, by construction, identical for every tenant. | A runtime `GET` against a hypothetical "my permitted items" endpoint — 004 exposes no such endpoint (by design: it decides per capability invocation, not per navigation render, per its own Out of Scope), and building one would make 004 own a UI concern its spec explicitly disclaims. |
| **Active tenant held in a cookie, not `localStorage`** | A server-rendered first paint (Next.js App Router's default) needs to know the active tenant before any client JavaScript runs, to avoid a flash of no-tenant or wrong-tenant content. `localStorage` is unavailable to the server render. | `localStorage` alone — simpler, but reintroduces exactly the "wrong-tenant screen that looks correct," the failure spec.md's own Story 2 priority rationale calls out as worse than a slow spinner. |
