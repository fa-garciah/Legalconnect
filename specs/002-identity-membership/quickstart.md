# Quickstart & Validation: Identity, Membership & Invitation

**Feature**: `002-identity-membership` | **Date**: 2026-08-21

How to run this slice and prove it actually works. Implementation detail belongs
in `tasks.md`; this document is the run-and-verify guide.

Entity shapes are in [data-model.md](./data-model.md), endpoint shapes in
[contracts/](./contracts/), and the reasoning behind each mechanism in
[research.md](./research.md). None of it is repeated here.

---

## Prerequisites

- Everything slice 001 required — Node.js LTS, npm, Docker for Testcontainers.
- No Cognito account needed. This slice receives an already-authenticated
  subject through test headers ([research.md D10](./research.md#d10--this-slices-http-surfaces-stay-off-the-network-the-same-way-001s-did)); it verifies nothing.
- No email provider account needed for the test suite — invitation "sending" in
  this slice's tests is asserting the message *content* against FR-036, not
  actually dispatching through SES (D7). Real dispatch is an infra concern for
  `/speckit-implement`, not for proving the guarantees below.

None of this slice's HTTP surfaces may be exposed to a network, the same
constraint 001 stated. Everything below runs against localhost.

## Setup

```bash
npm install
npm run db:up
npm run db:migrate       # + identity, membership, invitation; accept_invitation fn; platform grants
npm run db:seed          # 001's fixtures, replaced with real identity/membership rows
npm run dev
```

`db:seed` for this slice creates: two tenants (as 001 did), one identity holding
a live membership in each (replacing 001's `IDENTITY_DUAL` fixture with a real
row), one identity holding none (`IDENTITY_OUTSIDER`'s real-data equivalent), and
one pending invitation per tenant so the accept-flow tests have something valid
to consume without issuing one first.

## Run the suites

```bash
npm test
npm run test:isolation              # 001's full suite, unchanged, against real data — SC-001
npm run test:integration -- accept  # atomicity, concurrency, uniform refusal
```

---

## Validation scenarios

| # | Proves | Covers |
|---|---|---|
| V1 | Slice 001's complete isolation suite passes unchanged against the database-backed `MembershipPort` adapter | SC-001 |
| V2 | An identity with live memberships in two tenants: operating in tenant A discloses nothing about the tenant B membership, in any response | FR-023 (001), SC-002 |
| V3 | Naming a tenant with no live membership, and naming a tenant that does not exist, produce byte-identical responses | FR-014, SC-003 |
| V4 | A revoked membership is refused on every subsequent request, including one that succeeded moments before revocation | FR-010, SC-004 |
| V5 | Two concurrent accept attempts against the same invitation: exactly one membership results, the other sees the generic refusal | FR-023, SC-005 |
| V6 | Accepting invitations from two different tenants, as the same person: exactly one identity, exactly two memberships | FR-025, SC-006 |
| V7 | An expired invitation, a used invitation, and a revoked invitation all produce byte-identical refusal bodies | FR-022, SC-007 |
| V8 | Inviting a known email and an unknown email produce indistinguishable responses, across issue, accept and refuse paths | FR-028, SC-008 |
| V9 | No code path can insert a `membership` row outside `accept_invitation` — attempted directly, the ordinary role's missing `INSERT` grant refuses it at the database, not the application | FR-009, SC-009 |
| V10 | No code path can hard-delete an `identity` or `membership` row — no `DELETE` grant exists for any role | SC-010 |
| V11 | Each of the nine actions in this slice's audit vocabulary produces exactly one entry, for its own triggering action | FR-031, SC-011 |
| V12 | Every audit entry written by this slice is inspected and contains no email address or other contact detail | FR-032, SC-012 |
| V13 | An acceptance is forced to fail after the identity insert but before the membership insert (fault injection inside the definer function's transaction): zero identities, zero memberships, and the invitation remains `pending` afterward | FR-023, SC-013 |
| V14 | A membership whose identity has `mfa_enrolled_at IS NULL` is refused `403 mfa_not_enrolled` on every tenant-scoped request, and is refused nothing else about the request | FR-026, SC-014 |
| V15 | `GET /identity/memberships` is unreachable from within an active tenant context — attempted with `x-tenant-id` set, the result is identical to the same call with no tenant set at all | FR-017, SC-015 |
| V16 | A seed invitation attempted against a tenant already holding one live membership answers `409`, and zero seed invitations succeed past that point | FR-035, SC-016 |
| V17 | The rendered content of an invitation message (ordinary and seeded) contains no case data, client name or matter reference — inspected against the template, not merely against one instance | FR-036, SC-017 |
| V18 | Every invitation's `expires_at` equals `issued_at + 7 days` exactly, and no request can alter it | FR-027, SC-018 |
| V19 | A request carrying a tenant or archetype claim on `x-*` headers that contradicts the resolved membership is served according to the **resolved membership**, never the claim | FR-016, SC-019 |

## The failure that must be tested explicitly, again

001's `contracts/tenant-context.md` names the hazard: an unset context looks like
an empty database, not an error. This slice adds a second version of the same
hazard — **an unset `app.identity_id` also looks like an empty result, not an
error**, on `GET /identity/memberships` (V15) and on the self-row policy backing
`identity` (D4). A broken `IdentityContextInterceptor` and a genuinely new
identity with zero memberships produce the same observable response. V15 must
therefore assert both that the caller's own memberships are visible **and** that
they vanish the instant `x-identity-id` is omitted — a test that only checks the
first passes against a mechanism that sets nothing at all.
