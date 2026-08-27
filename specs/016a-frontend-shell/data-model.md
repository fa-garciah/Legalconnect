# Phase 1 — Data Model: Frontend Application Shell

**Feature**: `016a-frontend-shell` | **Date**: 2026-08-26
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

---

## This slice persists nothing

Per `spec.md`'s own Key Entities section: no table, no server-side record. Everything
below is a client-side TypeScript shape, either sourced from an existing backend response
(002's memberships enumeration) or held only for the lifetime of the browser tab.

| What | Where it lives | Owner |
|---|---|---|
| The identity and its live memberships | `GET /identity/memberships` response (002) | 002 |
| The active tenant selection | A cookie, client-side (research.md D2) | This slice |
| The navigation item registry | `frontend/src/shell/navigation-items.ts`, a checked-in constant | This slice |
| The capability matrix mirror | `frontend/src/authz/capability-matrix.ts` (research.md D1) | This slice, sourced from 004 |
| Per-region loading/error/empty state | TanStack Query's own cache entry state | TanStack Query, wrapped by `QueryBoundary` |

---

## `NavigationItem`

```ts
export interface NavigationItem {
  /** Stable across renames — used as the React key and by the capability-matrix sync test. */
  readonly id: string;
  /** Spanish, per FR-020. Never a translation key resolved elsewhere in this slice's scope. */
  readonly label: string;
  readonly href: string;
  /**
   * Absent ⇒ visible to every authenticated archetype (FR-003). Present ⇒ visible only
   * to a membership whose archetype appears here (FR-004) — sourced from
   * capability-matrix.ts (FR-025), never hand-maintained per item.
   */
  readonly requiredArchetypes?: readonly Archetype[];
}
```

`Archetype` is the same ten-code union `004/src/common/tenant/principal.ts` defines
(`SA | MP | AA | PL | CM | BM | CC | IC | CB | EL`) — transcribed here rather than
imported, since `frontend/` does not depend on `backend/`'s source tree (plan.md,
Structure Decision; research.md D1).

**Validation rule (FR-002, FR-019 by construction).** `navigation-items.ts` is a plain
array literal, not a class or a builder — there is no code path that could construct a
`NavigationItem` missing `id`, `label` or `href`, so "malformed item" is not a runtime
case this slice defends against; it is a compile error.

## `ActiveMembership` / `Principal`

```ts
export interface ActiveMembership {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly archetype: Archetype;
}

export interface Principal {
  readonly identityId: string;
  /** Every LIVE membership the identity holds, across every tenant (002/FR-017). */
  readonly memberships: readonly ActiveMembership[];
}
```

Supplied by `session/principal.ts` (research.md D5) — a fixture today, slice 003's
resolved session tomorrow, same shape either side.

## `ActiveTenant`

```ts
export type ActiveTenant =
  | { readonly status: 'none' }                              // FR-007
  | { readonly status: 'active'; readonly tenantId: string };
```

Read from, and written to, the cookie `research.md` D2 names. `'none'` is the state that
makes FR-007 ("no active tenant context → no navigation item, direct the person to
establish one") a rendered branch rather than an assumption every screen must
individually guard against.

**State transition.** `'none' → 'active'` happens once a `Principal` resolves with at
least one membership and either (a) it holds exactly one, auto-selected, or (b) the
person picks one via `TenantSwitcher`. `'active' → 'active'` (switching tenants) never
passes through `'none'` — the header and menu remain mounted throughout (FR-006), only
the content region's queries invalidate (FR-011).

## `Decision` (client-side refusal classification)

```ts
export type RefusalBucket = 'opaque' | 'role' | 'entitlement-feature' | 'entitlement-limit';

export interface ClassifiedRefusal {
  readonly bucket: RefusalBucket;
  /** Only for entitlement-feature — the capability id 004's body carries. */
  readonly capability?: string;
  /** Only for entitlement-limit — the { key, value } 004's body carries. */
  readonly limit?: { readonly key: string; readonly value: number };
}
```

Produced by `feedback/refusal-bucket.ts` from a failed response's `(status, error.code)`
(research.md D3). Never persisted, never compared across requests — a fresh
classification on every failure, which is what makes "navigate away and back re-attempts
fresh" (`spec.md` User Story 4, scenario 9) true by construction rather than by an
explicit cache-clear step.

## Region feedback state (not a new type — TanStack Query's own)

A `QueryBoundary`-wrapped region reads exactly one of TanStack Query's own
`status`/`fetchStatus` combination and a locally-computed "empty" predicate
(`data !== undefined && isEmpty(data)`, where `isEmpty` is supplied by the caller — a
list screen defines "empty" as `data.items.length === 0`, a detail screen might define it
differently). `QueryBoundary` does not invent a fourth persisted state; FR-019's mutual
exclusivity holds because these are read from one `status` enum, not from independently
toggled booleans that could disagree.

```ts
type RegionState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly refusal: ClassifiedRefusal; readonly retry: () => void }
  | { readonly kind: 'empty'; readonly guidance?: string }
  | { readonly kind: 'content' };
```
