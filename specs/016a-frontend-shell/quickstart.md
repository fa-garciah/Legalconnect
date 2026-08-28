# Quickstart — Validating the Frontend Application Shell

**Feature**: `016a-frontend-shell` | **Date**: 2026-08-26
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) |
**Contract**: [contracts/feedback-states.md](./contracts/feedback-states.md)

This is a run-and-verify guide, not an implementation guide. What each scenario proves is
stated; how it is built belongs in `tasks.md`.

---

## Prerequisites

Node.js 22 LTS, `npm ci` in `frontend/`. No AWS access, no Cognito, no real backend
deployment required for the unit and component tiers — only the e2e tier needs
`backend/`'s dev server running against the same seeded database 001/002/004's own test
suites use.

```bash
cd frontend
npm ci
npx vitest run tests/unit tests/component      # no browser, no backend
```

```bash
# e2e tier — needs the backend dev server up
cd backend && npm run db:up && npm run db:migrate && npm run db:seed && npm run dev &
cd frontend && npx playwright test
```

---

## Scenario 1 — The shell is the only navigation (US1, FR-001 to FR-005)

**Proves**: the menu is data-driven and archetype-filtered, not hand-built per screen.

```bash
npx vitest run tests/unit/navigation-items.test.ts tests/component/NavigationMenu.test.tsx
```

| Step | Expected |
|---|---|
| Render with a fixed item list, some archetype-gated, principal holds `MP` | Items with no `requiredArchetypes`, and items listing `MP`, render; items listing only other archetypes do not |
| Select a visible item | Content region changes; header and menu remain mounted (assert by DOM identity, not just visual) |
| Principal has no active tenant (`ActiveTenant.status === 'none'`) | Zero navigation items render; a directive to establish a tenant renders instead |

## Scenario 2 — Tenant context and switching (US2, FR-008 to FR-012)

**Proves**: the header always names the active tenant, and switching invokes 002's own
verification rather than a client-side shortcut.

```bash
npx vitest run tests/component/TenantSwitcher.test.tsx
npx playwright test tests/e2e/tenant-switch.spec.ts
```

| Step | Expected |
|---|---|
| Principal holds 2 live memberships | Header names the active one; a switch control is offered |
| Principal holds exactly 1 | No switch control renders |
| Switch to the second tenant | Header and content both reflect it within 2s (SC-007); 0 records from the first tenant remain in any tenant-scoped region |
| Attempt to select (by direct API call, bypassing the UI list) a tenant id the identity holds no membership in | Refused; rendered through the **opaque** bucket (SC-009), disclosing nothing distinguishing it from a nonexistent tenant |

## Scenario 3 — Loading (US3, FR-013, D4)

**Proves**: a pending region shows a deliberate indicator, never a flash, never an
indefinite spinner.

```bash
npx vitest run tests/component/QueryBoundary.test.tsx
```

| Step | Expected |
|---|---|
| A query resolving in <120ms | No loading indicator ever mounts |
| A query resolving in 2s | Loading indicator shown for the duration, replaced exactly once on resolution |
| A query still pending at 10s | Region transitions to the error state, opaque bucket, retry offered |
| Two independent regions, one resolves first | Only the resolved region leaves its loading state; the other is unaffected |

## Scenario 4 — Error, opaque and distinguishable (US4, FR-014 to FR-016, FR-024)

**Proves**: the line between "say nothing" and "say the remedy" is drawn once, correctly,
per research.md D3.

```bash
npx vitest run tests/unit/refusal-bucket.test.ts tests/component/ErrorState.test.tsx
```

| Step | Expected |
|---|---|
| Simulate `404 not_found`, `403 mfa_enrollment_required`, and a cross-tenant refusal (also `404 not_found`) | All three render **identically** — same copy, same layout (SC-005) |
| Simulate `403 not_authorized` | Renders the **role** bucket's distinct copy |
| Simulate `403 entitlement_required` | Renders the **entitlement-feature** bucket's distinct copy, distinguishable from `role` |
| Simulate `403 limit_reached` | Renders the **entitlement-limit** bucket's distinct copy |
| Retry after any of the above | The identical query re-issues (assert by spy on `refetch`), never a different request |
| Network failure (no response) | Opaque bucket, retry-only copy, implies no permission/scope/entitlement cause |
| Navigate away from an errored region and back | The query is fresh — no stale error re-rendered from a prior cache entry |

**Known limitation — RESOLVED 2026-08-27 by slice `006-client-case-core`, and resolved by
determination rather than by new code.**

The original note read: *"`scope`-class refusals are not yet separately reachable through
any real backend response (research.md D3) — this scenario does not simulate one, because
004 does not yet emit one."*

006 ships the first three `assigned`-scope capabilities (`case.read`,
`case.change_status`, `case.manage_team`), so the backend now emits scope refusals. But
they need **no new bucket, and no change to `refusal-bucket.ts`**: 006's Decision 4 settled
004's long-open Open Item 3 in favour of **404**, byte-identical to a resource that does
not exist. A scope refusal is therefore already covered by this scenario's very first row —
it is one of the responses that must render *identically* to the others, not a fourth case
needing distinct copy.

That is the opposite of what research.md D3 anticipated when it left room for a future
`'scope'` variant in `RefusalBucket`, and it is the better answer: a 403 saying "you are
not assigned to this" would confirm a matter exists, which in a firm running an ethical
wall is often the whole of the protected fact.

**Verified end to end**: `backend/tests/integration/assigned-scope-opacity.test.ts` asserts
that an unassigned case, a nonexistent case and another tenant's case produce
byte-identical responses — status, parsed body, and serialised JSON. `refusal-bucket.ts`
maps all three through `not_found` → **opaque**, and this file's own
`tests/unit/refusal-bucket.test.ts` passes unmodified.

**Action for a future reader**: the `'scope'` variant D3 left room for should not be added.
If one is ever wanted, it would require reopening 004's FR-017 amendment first.

## Scenario 5 — Empty (US5, FR-017, FR-018)

**Proves**: zero records reads as "nothing here yet," never as a broken screen.

```bash
npx vitest run tests/component/EmptyState.test.tsx
```

| Step | Expected |
|---|---|
| Successful response, `isEmpty(data)` true | Empty state renders, visually distinguishable from both loading and error (screenshot-diffed in the e2e tier) |
| A screen supplies `guidance` | Guidance text renders |
| A screen supplies no `guidance` | Nothing false is asserted about what the person can do — no fabricated call-to-action |

## Scenario 6 — Hiding is cosmetic, 004 remains the boundary (SC-014, FR-027)

**Proves**: a hidden navigation item's underlying capability is refused exactly as if the
item had never been hidden — this shell adds no enforcement.

```bash
npx playwright test tests/e2e/hidden-item-still-refused.spec.ts
```

| Step | Expected |
|---|---|
| Principal lacks the archetype for a navigation item (so it does not render) | Directly invoking the item's underlying API route (bypassing the UI entirely) is refused by 004's decision function, identically to a principal who never had the item hidden from them at all |

## Scenario 7 — Responsive, both viewports (SC-011, FR-021)

```bash
npx playwright test tests/e2e/responsive.spec.ts --project=desktop --project=mobile
```

| Step | Expected |
|---|---|
| Every control in the shell (menu items, tenant switch, retry buttons) at a desktop-sized viewport | Reachable and usable |
| The same, at a mobile-sized viewport | Reachable and usable — menu collapses/adapts, nothing is clipped or unreachable |

## Scenario 8 — The capability matrix mirror cannot silently drift (FR-025, research.md D1)

```bash
npx vitest run tests/unit/capability-matrix-sync.test.ts
```

| Step | Expected |
|---|---|
| `capability-matrix.ts` matches `004/spec.md`'s Capability Matrix table, row for row | Test passes |
| A row is deliberately changed in one file only (manual check, not a permanent test case) | Test fails, naming the mismatched row |

---

## Definition of Done for this slice

Constitution, *Definition of Done*, plus this slice's own:

- [ ] Every functional requirement above has a passing scenario
- [ ] `SC-001` through `SC-014` each map to at least one passing test
- [ ] `npx tsc --noEmit` (frontend) clean
- [ ] Spanish-only copy verified (SC-010) — no English string reaches a rendered
      component in `tests/component/`
- [ ] Capability matrix sync test green (Scenario 8)
- [ ] `US17`–`US20-EP00-FND` present in `master-user-story-catalog.md` (Principle I)
