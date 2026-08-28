# Quickstart — Validating the Firm Directory

**Feature**: `017-firm-directory` | **Date**: 2026-08-26
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) |
**Contract**: [contracts/directory-api.md](./contracts/directory-api.md)

This is a run-and-verify guide, not an implementation guide.

---

## Prerequisites

Identical to 004 — nothing new. `npm ci` in `backend/`, Docker running, `backend/.env`
already established.

```bash
cd backend
npm run db:up && npm run db:migrate && npm run db:seed
```

---

## Scenario 1 — Assign a position (US1, FR-001 to FR-005)

```bash
npx vitest run tests/contract/assign-position.test.ts
```

| Step | Expected |
|---|---|
| MP/SA assigns a catalog position to a live membership of their own tenant | `200`; `directory.position_assigned` audited with actor, subject, previous (`null`), new value |
| The same membership's directory entry is read again | Carries the new position |
| Assignment names a position id absent from the tenant's own catalog | `422 position_not_in_catalog` |
| MP/SA of tenant A assigns to a membership of tenant B | `404 not_found`, recorded as `tenant.cross_access_attempted` |
| A membership with no position ever assigned is read | Distinguishable from one holding a retired position — `positionId: null` vs. a real id whose catalog entry reads `status: retired` |
| An archetype other than MP/SA attempts assignment | `403 not_authorized` |
| The same membership's archetype is changed (004) after a position assignment | Position unchanged (SC-009) |

## Scenario 2 — Define the catalog (US2, FR-006 to FR-010)

```bash
npx vitest run tests/contract/position-catalog.test.ts
```

| Step | Expected |
|---|---|
| MP/SA adds a new position | `201`; available for assignment (Scenario 1) in that tenant only |
| A member of a different tenant reads or writes the catalog | Refused, cross-tenant recorded |
| A position held by existing assignments is retired | Existing directory entries still read it, marked retired; unavailable for new assignments |
| A freshly provisioned tenant's catalog is read | Already contains the 5-entry default seed (research.md D2), immediately editable |
| An archetype other than MP/SA attempts to add/retire | `403 not_authorized` |
| The same name is added twice (case-insensitive) while the first is still active | `409 position_already_exists` (research.md D6) |
| The same name is added again after the first is retired | `201` — succeeds (research.md D4/D6) |

## Scenario 3 — Browse the directory (US3, FR-011 to FR-013)

```bash
npx vitest run tests/contract/directory-read.test.ts
```

| Step | Expected |
|---|---|
| Any of the six internal archetypes reads the directory | Every live membership of that tenant, with position or "no position assigned"; 0 entries from any other tenant |
| A revoked membership | Absent from the listing; its historical `directory_entry` row is untouched |
| Any of the four portal archetypes attempts a read | Refused — `004/FR-020` |
| `PO` attempts a read | Refused — no tenant-scoped capability, `004/FR-008` |
| A tenant with more members than one page | First bounded page returned, `nextCursor` present, same shape as the audit read (`001/FR-013`) |

## Scenario 4 — The capability matrix grows to 24 rows, exhaustively (004's own suite, extended)

```bash
npx vitest run tests/unit/matrix-exhaustive.test.ts
```

| Step | Expected |
|---|---|
| 004's exhaustive suite re-run after this slice's registry extension | Still 0 pairs unasserted, now over 24 capabilities × 11 subjects |
| `capabilityDef`/`MATRIX` missing one of the 3 new rows | `tsc --noEmit` fails, naming the missing row (004/FR-021, unchanged mechanism) |

## Scenario 5 — Nothing that already worked stopped working

```bash
npm run test:isolation && npm run test:rls && npm run verify:role && npm test -- --coverage
```

| Assertion | Expected |
|---|---|
| 001/002/004's complete suites | Pass unchanged |
| `git diff --stat backend/drizzle/0006_grants.sql` | Empty — this slice adds grants on its own two new tables only, never touches an existing grant |
| Blocking coverage (`tenant`, `audit`, `authz`) | Still 100% |

---

## Definition of Done for this slice

Constitution, *Definition of Done*, plus this slice's own:

- [ ] Cross-tenant isolation test present and green for both new tables
- [ ] Audit event verified by test for every mutation (3 actions)
- [ ] Capability Matrix extension implemented and tested exhaustively (Scenario 4)
- [ ] `0020`/`0021` apply cleanly against the existing schema
- [ ] `US11`–`US13-EP10-CFG` added to `master-user-story-catalog.md`
