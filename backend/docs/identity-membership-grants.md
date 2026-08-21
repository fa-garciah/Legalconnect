# Identity, Membership & Invitation — Grant Lockdown

Slice 002 adds three tables. Each is locked down at the grant level, not by
convention, following the same discipline slice 001 established for
`audit_event`. This document is the reference for why each exception exists;
`specs/002-identity-membership/research.md` (D1, D3, D4, D6) is the source of
truth if this drifts.

## `identity`

- `lc_app`: `SELECT` only, restricted to `id = ` the caller's own
  `app.identity_id` setting. No `INSERT`, no `UPDATE`, no unrestricted `SELECT`.
- `lc_platform`: no grant at all.
- `lc_identity_writer` (the `accept_invitation()` function's owner): unrestricted,
  because it is the only legitimate path by which a row is ever created.

**Why**: FR-004 — "no tenant session may enumerate identities" — is written as
a data-layer guarantee. The only legitimate read this slice has is a caller
confirming its own row; nothing needs more.

## `membership`

- `lc_app`: `SELECT` under two permissive policies (`tenant_id` matches the
  active tenant, OR `identity_id` matches the caller's own identity — combined
  with `OR`, per PostgreSQL's permissive-policy semantics). `UPDATE` restricted
  to the tenant-scoped policy only — self-service can read its own rows but
  never mutate them. **No `INSERT` grant at all.**
- `lc_platform`: `SELECT` only, unrestricted by row (the D6 existence-check —
  "does this tenant have any live member," never who holds it).
- `lc_identity_writer`: `SELECT` (needed for the FR-029 already-a-member
  guard) and `INSERT`. Never `UPDATE` — revocation and archetype changes are
  tenant-scoped acts, never something the acceptance path performs.

**Why**: FR-009/SC-009 — "no membership can be created by any path other than
accepting an invitation" — has to be true of the grants, not of which code
happens to call them.

## `invitation`

- `lc_app`: `SELECT`, `INSERT` (own tenant, `seeded = false` only). `UPDATE`
  is column-level: `status`, `revoked_at` only — an ordinary member can revoke,
  never touch `expires_at`, `issued_at`, or any identifying column.
- `lc_platform`: `INSERT` only, restricted to `seeded = true` rows.
- `lc_identity_writer`: `SELECT` (to find a row by `reference_hash`, across
  every tenant) and column-level `UPDATE` (`status`, `accepted_at`,
  `failed_attempts`).

**Why**: `expires_at` must not be extendable by anyone (FR-027) — enforced
twice over, by the missing grant and by the `CHECK` tying it to `issued_at`.
`reference_hash`, not the row's `id`, is the bearer credential (research.md
D2), so only the accepting path ever looks a row up by it.

## `audit_event` (extended, not new)

`lc_app`'s own policy — unrestricted by action since 001 — is narrowed
(migration `0018`) to exclude `identity.created`, `membership.created`,
`invitation.accepted` and `invitation.refused`. Those four are written only by
`accept_invitation()`, via its own policy restricted to exactly those four
actions and nothing else. Nothing in application code ever wrote them through
the ordinary path, but before `0018` the grant would have allowed it — the
same "an absent method is bypassable, an absent grant is not" reasoning slice
001 applied to `audit_event`'s `UPDATE`/`DELETE` grants.

## The pattern, stated once

Every exception above is narrow, named, and satisfies exactly one requirement.
None reaches a business table. Each is exercised by a test that asserts its
limits (`backend/tests/integration/grants-lockdown.test.ts`,
`platform-scope.test.ts`, `audit-fields.test.ts`) — not only that the happy
path works, but that the narrower path a bug or a malicious actor would need
is actually closed.
