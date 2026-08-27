# Contract — The Feedback-State Protocol

**Feature**: `016a-frontend-shell` | **Constitution**: v1.4.0
**Status**: normative for every frontend slice downstream (006 onward).

> **Every later slice consumes this contract and does not restate it.** A screen that
> renders its own bespoke "loading…" text or its own retry button is building the
> fragmentation FR-001 and FR-019 exist to prevent. Wrap the region in `QueryBoundary`
> and supply data, not presentation.

---

## 1. The one way to back a region

```tsx
<QueryBoundary query={useCases(tenantId)} isEmpty={(data) => data.items.length === 0}>
  {(data) => <CaseList items={data.items} />}
</QueryBoundary>
```

`QueryBoundary` takes a TanStack Query result and an `isEmpty` predicate, and renders
exactly one of `LoadingState`, `ErrorState`, `EmptyState`, or the supplied children — never
more than one at once (FR-019, `data-model.md`'s `RegionState`). A screen never renders
`LoadingState`/`ErrorState`/`EmptyState` directly; doing so is how two regions on one
screen end up disagreeing about which state a shared network condition should produce.

## 2. What a screen owes this contract

A screen that fetches something:

- Uses `useQuery` (or a slice-specific hook built on it) — never raw `fetch` rendered
  directly into JSX.
- Supplies `isEmpty` whenever the success shape can legitimately be empty (a list). Omits
  it for a shape that cannot (a single resource fetched by id — its absence is a 404,
  routed to `ErrorState`, not to `EmptyState`).
- Supplies retry-relevant query keys that include every parameter the request depends on
  (tenant id among them — see §4), so `QueryBoundary`'s retry re-issues the *same*
  request (FR-015) rather than one missing a filter the person had set.

It does **not**: write its own loading spinner, its own error copy, its own empty-state
copy structure (the *guidance text*, where one exists, is the screen's; the *state
machine and layout* are not), or its own retry button wiring.

## 3. The error state's copy, by bucket

| Bucket | Example screen copy (Spanish, FR-020) | Retry offered |
|---|---|---|
| `opaque` | "No se pudo completar esta acción. Inténtalo de nuevo." | Yes |
| `role` | "Tu rol actual no permite esta acción." | Yes |
| `entitlement-feature` | "Tu plan actual no incluye esta función." | Yes (a plan change may have just happened — FR-024, 004/FR-007) |
| `entitlement-limit` | "Se alcanzó el límite de tu plan para esto." | Yes |

No screen overrides this copy per-instance — see research.md D3 for why the `opaque`
bucket is wider than "not found" alone, and for the one distinction (`scope`) this table
does not yet carry, pending 004's first `assigned` capability.

## 4. Retry re-issues the same request — what "same" means

`ErrorState`'s retry button calls the `refetch()` TanStack Query already attaches to the
query result passed into `QueryBoundary`. It is the **same** request per FR-015 exactly
because it is the same query object — no new object is constructed by `ErrorState`
itself. A screen that constructs a *new* query on every render (an inline object literal
as a query key, for instance) breaks this guarantee silently; `tests/component/` asserts
against a stable key, and a screen-level lint rule (`@tanstack/eslint-plugin-query`) is
adopted specifically to catch the unstable-key mistake at review time rather than at
runtime.

## 5. The tenant switch invalidates everything tenant-scoped, exactly once

`TenantSwitcher`'s selection handler calls
`queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'principal' })` —
every query except the principal/membership list itself, which does not vary by active
tenant. A screen that fetches tenant-scoped data MUST include the active tenant id as
part of its query key (`['cases', tenantId]`, never bare `['cases']`), or invalidation
has nothing distinct to target and FR-011's "zero records from the previously active
tenant" is not guaranteed for that screen specifically — this is the one obligation a
later screen owes this contract that a lint rule cannot fully enforce, and is called out
explicitly here for that reason.

## 6. What downstream slices owe this contract

A slice adding a screen:

- Wraps every network-backed region in `QueryBoundary`.
- Includes the active tenant id in every tenant-scoped query key (§5).
- Supplies its own `isEmpty` predicate and its own empty-state guidance text where one
  applies (FR-018) — the empty-state *layout* is not theirs to vary.
- Adds nothing to `refusal-bucket.ts`'s classification table itself; a genuinely new
  refusal shape is a 004 contract change first (per `004/contracts/refusal.md` §6), this
  file's table second.

It does **not** add: a fourth feedback state, a bespoke loading/error/empty visual
treatment, or a retry mechanism that does not call the query's own `refetch()`.
