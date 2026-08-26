# Quickstart — Validating Authorization & Tier Entitlements

**Feature**: `004-authorization-entitlements` | **Date**: 2026-08-26
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) |
**Contract**: [contracts/refusal.md](./contracts/refusal.md)

This is a run-and-verify guide, not an implementation guide. What each scenario proves
is stated; how it is built belongs in `tasks.md`.

---

## Prerequisites

Same as slices 001 and 002 — nothing new. **This slice needs no AWS access and no
external service**, which is what makes it runnable today.

- Node.js LTS, `npm ci` in `backend/`
- Docker running, for the Testcontainers suites
- `backend/.env` with the connection strings 001 established

```bash
cd backend
npm ci
docker info > /dev/null && echo "docker ok"
```

**The distinguishing property of this slice**: its core needs none of the above.

```bash
# The exhaustive matrix suite. No database, no HTTP, no container.
npx vitest run tests/unit/matrix-exhaustive.test.ts tests/unit/deny-by-default.test.ts \
               tests/unit/portal-archetypes-empty.test.ts tests/unit/refusal-ordering.test.ts \
               tests/unit/entitlement.test.ts tests/unit/scope-resolver.test.ts
```

Expect this to finish in under a second. A pure function admits **enumeration** rather
than sampling, which is the whole reason the module has no framework import above
`guard.ts`.

---

## Full run

```bash
cd backend
npm run migrate        # applies 0019 (the last-SA trigger)
npm test               # unit + contract + integration, Testcontainers included
npm run test:coverage  # thresholds are blocking — see below
```

Two coverage thresholds are added to `vitest.config.ts` at the standing tenant isolation
already holds (FR-012, SC-016):

```
src/common/tenant/**   100%   (existing, unchanged)
src/common/audit/**    100%   (existing, unchanged)
src/common/authz/**    100%   (new — the refusal paths)
```

---

## Scenario 1 — The default is closed (US1, FR-002, SC-002)

**Proves**: absence of a rule is a refusal, not a gap.

```bash
npx vitest run tests/unit/deny-by-default.test.ts
```

| Step | Expected |
|---|---|
| Add a capability to a test-local registry with **no** matrix row | The build fails first — `Record<CapabilityId, …>` is total. The test asserts the runtime behaviour of the same shape via a deliberately-cast fixture. |
| Invoke it for each of the eleven subjects | **11 of 11 refused**, reason `permission` |
| Invoke a capability whose declared scope kind has no registered resolver | Refused, reason `scope` — never permitted (US5 scenario 6) |
| Invoke with `capability: null` | Refused before anything else is evaluated (FR-019) |

**The compile-time half matters more than the runtime half.** Verify it by hand once:

```bash
# Add a key to CAPABILITIES in capability.ts, do NOT add its MATRIX row:
npx tsc --noEmit
# Expect: error naming the missing property in matrix.ts. That is FR-021.
```

---

## Scenario 2 — Every pair is asserted, none sampled (US2, SC-001, SC-010)

**Proves**: the matrix is a property, not a spot check.

```bash
npx vitest run tests/unit/matrix-exhaustive.test.ts
```

The suite iterates `Object.keys(CAPABILITIES)` — never a hand-written list (FR-018) —
across the eleven subjects, and asserts each outcome against the table in
[data-model.md](./data-model.md).

| Assertion | Expected |
|---|---|
| Pairs asserted | **0 unasserted**, for every capability whose scope kind is `tenant` or `none` |
| Rows 9–10 (`self`) | Asserted **archetype-independent**, not per-subject — see research.md D8 |
| Portal archetypes `CC`/`IC`/`CB`/`EL` × every tenant-scoped capability | **0 permitted**, asserted individually (SC-004) |
| `PO` × the 8 tenant-scoped capabilities | **0 permitted** (FR-008) |
| `PO` × the 7 platform capabilities | **7 permitted**, no more and no fewer (SC-003) |

---

## Scenario 3 — The server decides, and the client cannot influence it (US2, FR-003)

**Proves**: the decision the endpoint reaches equals the decision the function reaches.

```bash
npx vitest run tests/integration/po-refused-everything.test.ts \
               tests/contract/capability-declared-everywhere.test.ts
```

| Step | Expected |
|---|---|
| Drive a sampled set of pairs through HTTP and compare to `decide()` | Identical outcomes for every pair sampled (SC-010) |
| Send an archetype in a header contradicting the stored membership | Stored membership governs; the claim is ignored (002's V19, not regressed) |
| Enumerate every route in the Nest router | **0 routes** carry no `@Capability` (SC-013) |
| Enumerate every route | **0 routes** carry both `@PlatformSurface()` and a `tenant`-scoped capability |
| Add a deliberately-undeclared test route and call it | Refused, `404` (FR-019) |

That last row is the one that closes the fail-open path the spec's §2 describes, where an
undeclared route today passes straight through for every live membership of the tenant.

---

## Scenario 4 — Tier entitlement, with no deployment (US3, FR-007, SC-007)

**Proves**: the mapping is configuration, and behaves like it.

```bash
npx vitest run tests/integration/entitlement-no-deploy.test.ts
```

| Step | Expected |
|---|---|
| Hold archetype and capability fixed; flip `plan.entitlements[key]` to `false` | Next request refused, `403 entitlement_required` |
| Compare with an archetype refusal for the same capability | **Distinguishable** — different code (FR-006) |
| Flip it back | Next request permitted — **0 restarts, 0 deployments** |
| Change the tenant's `plan_id` outright | The next request is evaluated against the new plan (FR-027) |
| Trip permission *and* entitlement at once | Exactly one reason, and it is `permission` (FR-022, SC-005) |

**No sleep, no cache warm-up, no invalidation step anywhere in this scenario.** That is
the observable form of research.md D7: the plan is read per request in the query that
already runs, so there is nothing to invalidate. If a future change introduces a cache,
this scenario is where it will be caught.

**The limit path ships tested but unreached.** No capability in this slice's matrix
creates a countable thing, so `entitlement.test.ts` exercises the limit shape and its
`limit: { key, value }` payload against the pure function (FR-024), and no integration
scenario can trip it yet. Recorded in research.md D4 as a decision, not an omission.

---

## Scenario 5 — Live archetype changes (US4, SC-011)

**Proves**: no grace period, no session cache.

```bash
npx vitest run tests/integration/archetype-change-live.test.ts
```

| Step | Expected |
|---|---|
| `SA` demotes a live `MP` to `AA` | `200`, `membership.archetype_changed` audited with actor, subject, previous, new |
| The demoted member's **very next** request to an `MP` capability | Refused — **0 requests** decided under the previous archetype (SC-011) |
| `SA` of tenant A changes a member of tenant B | Refused, and `tenant.cross_access_attempted` emitted (FR-025, SC-015) |

---

## Scenario 6 — A tenant always keeps one `SA` (US4, FR-010, SC-009)

**Proves**: the invariant holds under concurrency, not just in sequence.

```bash
npx vitest run tests/integration/last-sa-protected.test.ts
```

| Step | Expected |
|---|---|
| Reduce a tenant to one live `SA`; change their archetype | Refused |
| Same tenant; revoke that membership | Refused, **by the same rule** — one trigger covers both paths |
| Two `SA`s remaining; demote both **concurrently** | Exactly one succeeds. The second blocks on `FOR UPDATE`, re-reads, and is refused |
| An `SA` who is last in tenant A but not in tenant B; act in B | Permitted — the invariant is per membership, not per person |

The concurrent row is the one worth running twice. An application-level check-then-write
passes the first two rows and fails this one, which is why research.md D5 chose a trigger.

---

## Scenario 7 — Scope, with the resolver that does not exist yet (US5)

**Proves**: the port is real before its first consumer is.

```bash
npx vitest run tests/unit/scope-resolver.test.ts
```

| Step | Expected |
|---|---|
| Register a stub `assigned` resolver answering `true` | Outcome tracks the resolver |
| Same stub answering `false` | Refused, reason `scope` — distinguishable from `permission` and `entitlement` in the `Decision` (FR-017) |
| Supply a caller-side claim of assignment in the request | Ignored entirely (FR-014) |
| Unregister the resolver, declare `assigned` anyway | Refused, never permitted (US5 scenario 6) |
| A `self`-scope capability targeting another person's record | Refused, reason `scope` |

**The wire status for an `assigned` refusal is not asserted here**, because no capability
in this slice's registry resolves at that kind and the mapping is still open — research.md
D6, and `plan.md` Open Items. The `Decision` distinction is asserted; the HTTP projection
is asserted by the slice that ships the first `assigned` capability.

---

## Scenario 8 — Nothing that already worked stopped working (SC-017)

**Proves**: the strongest single claim this slice makes.

```bash
npx vitest run tests/integration/isolation tests/integration/grants-lockdown.test.ts \
               tests/integration/rls-coverage.test.ts tests/contract
```

| Assertion | Expected |
|---|---|
| 001 and 002's complete cross-tenant isolation suite | **Passes unchanged** |
| Test files modified to accommodate this slice | **0** |
| Grants or policies weakened | **0** |
| `git diff --stat backend/drizzle/0006_grants.sql` | empty |

The zero on the second row is a consequence of Decision 6. Had `MP` been narrowed, 002's
contract suite would have been edited to expect the new refusals — and the suite being
edited would be the one that proves isolation.

---

## Definition of Done for this slice

Constitution, *Definition of Done*, plus this slice's own:

- [ ] Cross-tenant isolation test present and green — **inherited unchanged, 0 edits**
- [ ] Audit event verified by test for every mutation — inherited; this slice adds no action
- [ ] The spec's permission matrix implemented and tested — **exhaustively**, SC-001
- [ ] Entitlement verification implemented — the mechanism, FR-005 through FR-007
- [ ] Secret scanning and dependency scanning green
- [ ] `src/common/authz/**` at 100% coverage, blocking (FR-012, SC-016)
- [ ] `npx tsc --noEmit` fails when a capability lacks a matrix row (FR-021)
- [ ] `@RequireArchetypes` deleted, its four call sites migrated to `@Capability`
- [ ] `0019` applied; `0020` dropped from the branch if the grant audit finds nothing (D10)
