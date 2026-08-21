# Quickstart Validation Results: Identity, Membership & Invitation

**Feature**: `002-identity-membership` | **Date**: 2026-08-21

Run against a fresh from-scratch schema — `DROP SCHEMA public CASCADE`, then
`npm run db:migrate` (all 19 migrations, 0000–0018) and `npm run db:seed` —
followed by `npm test -- --coverage`. This is the acceptance bar `plan.md`
states: the committed migration files alone, not any live database patch made
during development, produce a fully working system.

## Result

```
Test Files  65 passed (65)
     Tests  316 passed (316)
```

Blocking coverage (Constitution, Development Workflow & Quality Gates):

| Path | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `src/common/tenant/**` | 100% | 100% | 100% | 100% |
| `src/common/audit/**` | 100% | 100% | 100% | 100% |

## Validation scenarios (V1–V19)

| # | Proves | Result |
|---|---|---|
| V1 | Slice 001's isolation suite passes unchanged against `DbMembershipPort` | ✅ `isolation/membership-real-data.test.ts` |
| V2 | Dual-tenant membership discloses nothing about the other tenant | ✅ same file |
| V3 | No-membership vs. nonexistent-tenant refusals are byte-identical | ✅ same file |
| V4 | A revoked membership is refused on every subsequent request | ✅ same file |
| V5 | Concurrent acceptance of one invitation yields exactly one membership | ✅ `contract/accept-invitation.test.ts` |
| V6 | One identity, two tenants accepted, exactly two memberships | ✅ `integration/accept-invitation-multi-tenant.test.ts` |
| V7 | Expired/used/revoked/nonexistent refusals are byte-identical | ✅ `contract/invitation-refusal-uniformity.test.ts` |
| V8 | Known vs. unknown email indistinguishable across issue/accept | ✅ `contract/enumeration-invite-uniform.test.ts`, `enumeration-duplicate-invite.test.ts` |
| V9 | No path can `INSERT` a `membership` row outside `accept_invitation()` | ✅ `integration/grants-lockdown.test.ts` |
| V10 | No `DELETE` grant exists for `identity` or `membership` | ✅ verified by grant inspection (no test asserts a negative capability that was never granted; see `0012`/`0013`) |
| V11 | Each of the nine actions produces exactly one entry per trigger | ✅ `integration/audit-fields.test.ts` |
| V12 | No audit entry from this slice contains an email or contact detail | ✅ `integration/audit-no-pii-002.test.ts` |
| V13 | A refused acceptance leaves 0 identities, 0 memberships, 1 unused invitation | ✅ `contract/accept-invitation.test.ts`, `integration/invitation-expiry.test.ts` |
| V14 | `mfa_not_enrolled` refuses every tenant-scoped request, and only that | ✅ `integration/mfa-gate.test.ts` |
| V15 | `GET /identity/memberships` is unreachable from an active tenant context | ✅ `contract/enumerate-own-memberships.test.ts` |
| V16 | A seed invitation against an administered tenant fails; the operator gains nothing | ✅ `contract/seed-first-administrator.test.ts` |
| V17 | The invitation message template carries only firm name + reference | ✅ `unit/invitation-message-template.test.ts` |
| V18 | `expires_at` cannot be altered by any request | ✅ `integration/grants-lockdown.test.ts` |
| V19 | A resolved membership, never a header claim, governs the request | ✅ `isolation/membership-real-data.test.ts` |

## Deviations from the plan, discovered while implementing

1. **`expires_at` could not be a `GENERATED` column.** PostgreSQL rejects
   `timestamptz + interval` in a `GENERATED ALWAYS AS` expression as not
   `IMMUTABLE`. Replaced with a `DEFAULT` computed at insert time plus a
   `CHECK (expires_at = issued_at + interval '7 days')`, and column-level
   `UPDATE` grants that withhold `expires_at`/`issued_at` from every role. The
   guarantee is unchanged; the mechanism is two independent layers instead of
   one. Recorded in `data-model.md`.
2. **`INSERT ... RETURNING` requires `SELECT`.** Hit three times — the
   `accept_invitation()` function's `membership` insert, and the seed-
   administrator service's `invitation` insert — for the same reason 001's
   own `audit_append_cross_tenant_attempt` hit it in `0009`. Resolved the same
   way each time: generate the id (and, for the seed service, the
   timestamps) in code and insert them explicitly, rather than widen the
   grant.
3. **FR-029 needed a second guard, at acceptance, not only at issuance.**
   Issuing a second invitation to an already-member email was always safe
   (issuance never touches `membership`). Accepting one was not: without a
   check, it would hit `membership`'s `(identity_id, tenant_id)` unique
   constraint and surface as an unhandled `500` instead of the ordinary
   generic refusal. `accept_invitation()` now checks for an existing live
   membership before inserting a new one. Caught by
   `enumeration-duplicate-invite.test.ts`.
4. **The per-tenant issuance rate (research.md D8) was revised from 50 to 200
   per hour.** 50 self-throttled ordinary repeated test/dev traffic against
   one seeded tenant well before an hour passed — a real finding from running
   the suite repeatedly during implementation, not a hypothetical. 200 still
   meaningfully bounds enumeration while giving legitimate bulk onboarding
   headroom. `.env.example`, `research.md` D8 and `plan.md` updated to match.
5. **`lc_app`'s own `audit_event` grant was wider than intended before this
   slice tightened it.** Table-wide, action-unrestricted, `lc_app` could have
   inserted `identity.created`/`membership.created`/`invitation.accepted`/
   `invitation.refused` directly — nothing in application code ever did, but
   the grant allowed it. Migration `0018` narrows `lc_app`'s `WITH CHECK` to
   exclude those four actions, closing the gap at the data layer rather than
   leaving it as an absence of a caller.

## Not yet built (explicitly out of scope for this slice)

- Real SES dispatch of the invitation message (composed by
  `message-template.ts`; sending is an infra concern per `plan.md` open item
  2).
- Network exposure of any route in this slice — all remain loopback-only per
  research.md D10, pending slice 003's real authentication.
