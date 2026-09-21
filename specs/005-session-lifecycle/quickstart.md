# Quickstart: Session Lifecycle

**Slice**: `005-session-lifecycle` | **Date**: 2026-09-21

How to prove this slice works end to end. Validation scenarios and the commands that run them — not
implementation. Entity shapes are in [data-model.md](./data-model.md), route shapes in
[contracts/](./contracts/), decisions in [research.md](./research.md).

## Prerequisites

```bash
cd backend
npm install
npm run db:up
npm run db:migrate          # must include this slice's new migration(s), after 0036
npm run db:seed             # one tenant, one confirmed identity per role class (see below)
```

**No new environment variables.** This slice introduces no configuration surface of its own — the
six idle/absolute numbers are compile-time constants (`common/auth/session-lifecycle.ts`), not
runtime-tunable, the same non-configurability posture `003/FR-007` established for MFA enforcement
and that this slice's own spec.md carries forward by omission (nothing in FR-007/FR-008 says
"configurable").

**Seed data needed for the six-case matrix (User Story 3)**: one confirmed identity holding a live
membership per role class — one internal archetype (any of `MP`/`AA`/`PL`/`CM`/`BM`), one `SA`, one
portal archetype (any of `CC`/`IC`/`CB`/`EL`). `seedAuthIdentity()` (`tests/helpers/auth-seed.ts`) plus
a raw `INSERT INTO membership` per `tests/integration/archetype-change-live.test.ts`'s existing
pattern covers all three.

## Run everything

```bash
cd backend && npm test          # unit + contract + integration
```

No frontend or e2e suite is required by this slice's Out of Scope ("any user interface beyond what's
needed to exercise sign-out and the step-up challenge — administrative UI is `014`") — this is a
backend-only slice, unlike `003` which shipped screens.

### The blocking suites, individually

Following `003`'s own convention of naming non-negotiable-coverage suites separately rather than
folding them into an aggregate pass/fail — the constitution's Testing discipline section names
"authentication and sessions" as one of the paths requiring complete, blocking CI coverage, and this
slice is squarely inside that path:

```bash
cd backend
npx vitest run tests/integration/sign-out.test.ts                    # SC-001, US1 scenarios 1-6
npx vitest run tests/integration/idle-absolute-expiry.test.ts        # SC-002-004, US3 scenarios 1-8
npx vitest run tests/integration/step-up.test.ts                     # SC-005-006, US2 scenarios 1-7
npx vitest run tests/integration/tenant-deactivation-session.test.ts # SC-007, US4 scenarios 1-4
```

## Scenario walkthroughs

### 1. Sign out and confirm it's dead everywhere

```bash
# Sign in for real tokens (reuses 003's flow — see 003/quickstart.md)
ACCESS=$(...)   # from POST /auth/factor
REFRESH=$(...)

curl -s -X POST localhost:3000/auth/sign-out -H "Authorization: Bearer $ACCESS"
# → 200 { "signedOut": true }

curl -s localhost:3000/some/authenticated/route -H "Authorization: Bearer $ACCESS"
# → 401 "No autenticado."

curl -s -X POST localhost:3000/auth/refresh -d "{\"refreshToken\":\"$REFRESH\"}"
# → refused, same shape rotate_refresh() already returns for a revoked token

curl -s -X POST localhost:3000/auth/sign-out -H "Authorization: Bearer $ACCESS"
# → 200 { "signedOut": true } — idempotent, second call, same response
```

Confirm in the database: `SELECT revoked_at FROM session WHERE ...` — not null on every row sharing
the family; a session from a *different* sign-in (different device) for the same identity is
unaffected.

### 2. Idle expiry without waiting real hours

Integration tests advance the clock at the database, not the application — `UPDATE session SET
last_seen_at = now() - interval '31 minutes' WHERE id = ...` against an `SA` session, then issue a
request and assert `401`. This is the same "move the stored timestamp, not the wall clock" technique
`003`'s own lockout tests already use for `identity_factor.locked_until`.

### 3. Step-up turns on a previously-withheld capability

```bash
# Ordinary session, MP archetype, not freshly authenticated
curl -s -X POST localhost:3000/memberships/$ID/revoke -H "Authorization: Bearer $ACCESS"
# → 403 { "error": "step_up_required", ... }

curl -s -X POST localhost:3000/auth/step-up -H "Authorization: Bearer $ACCESS" \
  -d '{"capability":"membership.revoke","code":"492013"}'
# → 200 { "stepUpToken": "…", "expiresAt": "…" }

curl -s -X POST localhost:3000/memberships/$ID/revoke -H "Authorization: Bearer $ACCESS" \
  -H "X-Step-Up-Token: …"
# → 200 — the operation completes

curl -s -X POST localhost:3000/memberships/$OTHER_ID/revoke -H "Authorization: Bearer $ACCESS" \
  -H "X-Step-Up-Token: …"   # same token, reused
# → 403 step_up_required — single-use, already consumed
```

Repeat once per each of the five gated capabilities (SC-005, SC-006) — `step-up.test.ts` is the
exhaustive version of this walkthrough.

### 4. Tenant deactivation — confirming, not building

```bash
# Identity with live memberships in Tenant A and Tenant B, one session
curl -s localhost:3000/cases -H "Authorization: Bearer $ACCESS" -H "x-tenant-id: $TENANT_A"
# → 200

# (deactivate Tenant A via existing 001 mechanism)

curl -s localhost:3000/cases -H "Authorization: Bearer $ACCESS" -H "x-tenant-id: $TENANT_A"
# → 404 — 001's existing refusal, unchanged by this slice

curl -s localhost:3000/cases -H "Authorization: Bearer $ACCESS" -H "x-tenant-id: $TENANT_B"
# → 200 — unaffected, same session, different tenant
```

This scenario exercises no code this slice wrote (`research.md` D7) — its value is confirming `001`'s
existing mechanism still holds under this slice's changes to the request pipeline, not testing new
behavior.

## Non-negotiable coverage checklist (constitution, Testing discipline)

- [ ] Idle expiry, all three role classes, both directions (idle-triggers, absolute-triggers) — 6
      cases (SC-002–004)
- [ ] Sign-out kills the whole family, not just the current token (SC-001)
- [ ] Sign-out is idempotent and discloses nothing (FR-005)
- [ ] All five step-up-gated capabilities individually exercised, both refused-without and
      succeeded-with (SC-005, SC-006)
- [ ] Step-up token is single-use and capability-scoped (US2 scenario 5)
- [ ] Idle/absolute refusal is byte-identical to "not authenticated" (FR-005, FR-011)
- [ ] Zero audit entries for idle/absolute expiry and for tenant-deactivation's session effect
      (FR-011, FR-015)
- [ ] Exactly one audit entry each for sign-out and step-up verification (SC-008)
- [ ] A session live before this slice's deploy is not force-signed-out (FR-025, SC-009)
