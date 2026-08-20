# Quickstart & Validation: Tenant Foundation & Audit Log

**Feature**: `001-tenant-foundation` | **Date**: 2026-08-19

How to run this slice and prove it actually works. Implementation detail belongs in
`tasks.md`; this document is the run-and-verify guide.

Entity shapes are in [data-model.md](./data-model.md), endpoint shapes in
[contracts/](./contracts/), and the reasoning behind each mechanism in
[research.md](./research.md). None of it is repeated here.

---

## Prerequisites

- Node.js LTS and npm
- Docker running — the isolation tests bring up a real PostgreSQL via Testcontainers ([D11](./research.md#d11--isolation-tests-run-against-real-postgresql-as-the-real-role))
- No cloud account needed; nothing in this slice talks to AWS

Neither HTTP surface may be exposed to a network in this slice — it authenticates
nothing yet. Everything below runs against localhost.

## Setup

```bash
npm install
npm run db:up            # start PostgreSQL for local work
npm run db:migrate       # schema, RLS policies, roles, monthly partitions
npm run db:seed          # three plans, two tenants, fixture identities and memberships
npm run dev              # serve on localhost
```

`db:migrate` runs as the migration/owner role. The app then connects as the
non-owner application role — two different roles, which is the whole point of
[D4](./research.md#d4--rls-shape-and-the-role-configuration-that-actually-enforces-it).

The seed creates two tenants so cross-tenant checks have somewhere to reach, plus one
identity holding membership in **both** — without it, SC-014 cannot be exercised.

## Run the suites

```bash
npm test                 # everything
npm run test:isolation   # cross-tenant leak suite — the merge gate
npm run test:rls         # every tenant-scoped table has RLS enabled and a policy
npm run verify:role      # connected role is not superuser, owns nothing, no BYPASSRLS
```

---

## Validation scenarios

| # | Proves | Covers |
|---|---|---|
| V1 | Application role is not superuser, owns no tables, lacks `BYPASSRLS` | [D4](./research.md#d4--rls-shape-and-the-role-configuration-that-actually-enforces-it) |
| V2 | Every tenant-scoped table has row security and a policy; a new one without a policy fails the build | FR-015, SC-009 |
| V3 | Unfiltered read returns own rows and zero foreign rows | FR-003, SC-001 |
| V4 | Cross-tenant request answers `404` and is recorded against the target | FR-008, AS-02, SC-003 |
| V5 | Audit entries cannot be updated or deleted by the application | FR-011, AS-04, SC-005 |
| V6 | A mutation whose audit entry fails leaves no trace | FR-017, SC-012 |
| V7 | Duplicate RFC is refused and leaves no partial tenant | FR-007, US3 sc. 2 & 5 |
| V8 | Plan and plan limits change with no deployment | FR-004, FR-016, SC-008 |
| V9 | Audit query is tenant-scoped, clamped to 24 months, and self-audits only on interactive reads | FR-013, FR-014, FR-019, SC-007, SC-013 |
| V10 | An identity in two tenants leaks neither to the other | FR-023, SC-014 |
| V11 | Deactivation refuses activation and retains records | FR-006, US3 sc. 3 & 4 |
| V12 | Async jobs are isolated exactly as requests are | FR-005 |
| V13 | Every one of the seven actions emits exactly one entry with all required fields; the two channel-gated ones emit only on interactive reads | FR-010, FR-014, FR-025, FR-026, SC-004 |
| V14 | No entry contains end-client personal data, secrets or authentication factors | FR-012, SC-006 |
| V15 | **No active tenant context → zero rows and no error**, on every tenant-scoped table | Constitution v1.3.0 |

The ones expanded below fail in ways the others cannot detect. Run them first when
something looks wrong.

### V1 — the misconfiguration that fakes success

```bash
npm run verify:role
```

**Expect**: `rolsuper = false`, zero tables owned, `rolbypassrls = false`, and the
process starting.

**Why it leads**: PostgreSQL silently ignores RLS for superusers and table owners. Get
this wrong and every policy is still in place, V2 still passes, V3 still passes, and
there is no isolation at all. It is the only failure in this slice that makes the
entire test suite lie, so it is asserted at startup and not merely in CI.

### V3 — assert both directions or the test is worthless

```bash
npm run test:isolation -- -t "unfiltered read"
```

**Expect**: with tenant A active, a read carrying no tenant condition returns **all
of A's seeded rows and none of B's**.

**Why both**: an unset tenant context looks like an empty database, not an error
([D3](./research.md#d3--tenant-activation-happens-once-per-transaction-and-fails-closed)).
A test that only checks "no foreign rows" passes when the middleware activates
nothing whatsoever. Asserting own rows are visible in the same breath is what
separates working isolation from a broken context.

### V4 — the response must not disclose, and the record must not either

```bash
npm run test:isolation -- -t "cross-tenant request"
```

**Expect**: `404` with the generic error body — never `403`, never `200`. One
`tenant.cross_access_attempted` entry in **tenant B's** log. That entry names the
resource, timestamp, source and an opaque identity reference, and **does not name
tenant A**.

**Why the second half**: telling firm B that a member of firm A reached for its matter
discloses that firm A exists and is adjacent to that matter, which can itself be
privileged, and breaches FR-023. Assert the absence, not just the presence
([D8](./research.md#d8--recording-a-cross-tenant-attempt-without-leaking-the-actors-other-tenants)).

### V6 — atomicity

Force the audit append to fail (the suite does this by revoking `INSERT` on the audit
table inside the test transaction), then attempt a plan change.

**Expect**: the request fails, and the tenant's `plan_id` is unchanged when read
afterwards. Zero observable effects.

**Why it matters**: this is the difference between an audit log that is evidence and
one that is a hint. If a mutation can commit without its entry, Principle V's
guarantee is gone and nothing in the log's contents will reveal the gap.

### V10 — multi-membership containment

Using the seeded identity that belongs to both tenants:

**Expect**: operating with A active returns A's data only; operating with B active
returns B's only; and **no response in either tenant** — including the audit query,
which is the most likely leak — reveals the existence, count or identity of the other
membership.

**Why it is here**: this scenario only exists because
[D1](./research.md#d1--a-person-may-hold-access-to-more-than-one-tenant) chose
separate identity and membership. Under one-tenant-per-user it would be untestable,
and the leak it guards against would be structurally impossible. Having chosen the
more capable model, this is the check that pays for it.

### V9 — reading the log records the read, but only when a person did it

```bash
npm test -- -t "audit query"
```

**Expect**: tenant-scoped results, `from`/`to` clamped to 24 months with the served
window reported, and — the part that must be asserted both ways — **an interactive
read produces exactly one new `audit.queried` entry, while an automated read
produces none**. The test performs each kind of read, counts entries before and
after, and asserts `+1` and `+0` respectively.

**Why both directions**: asserting only that automated reads are silent would pass
against an implementation that stopped recording reads altogether, which would break
FR-014. Asserting only that interactive reads are recorded would miss the
unbounded-growth problem the rule exists to prevent.

### V13 — all seven actions, and the two that are conditional

```bash
npm test -- -t "audit vocabulary"
```

**Expect**: each of the seven actions in the vocabulary produces exactly one entry
carrying all six required fields — actor, action, target entity, timestamp, source
and tenant.

Five of the seven are unconditional. The two channel-gated ones are asserted in both
directions, the same way and for the same reason as V9:

- **Audit log read** — an interactive read produces exactly one `audit.queried` entry; an automated read produces none.
- **Tenant registry read** — an interactive read of the tenant registry produces exactly one `tenant.registry_read` entry; an automated read produces none.

**Why the registry read is here at all**: the registry carries every firm's name, RFC
and commercial plan, so a platform operator browsing it is precisely the access
Principle V exists to leave a trace of. It was unaudited while the audit log read was
audited — an inconsistency, not a deliberate exception. The channel gate came with it
so that monitoring the platform surface cannot inflate the log either.

### V15 — no tenant context at all

```bash
npm run test:isolation -- -t "no tenant context"
```

**Expect**: for **every** tenant-scoped table, a connection with no tenant context
active returns **zero rows and raises no error**. Not a 500, not an exception — an
empty result.

**Why it is a gate and not a nicety**: this is the case Constitution v1.3.0 requires
for every tenant-scoped table, and it is the test that detects a policy written with
the bare `current_setting` form instead of the null-safe one. The catalog check (V2)
confirms a policy *exists*; it cannot read whether the predicate is null-safe. This
scenario is what closes that gap, which is why the constitution pairs the two.

It is also the reason V3 asserts both directions: V15 proves the no-context case is
silent, and V3 proves that silence is not simply how the system behaves all the time.

---

## CI gates

All blocking. A red result is never merged.

| Gate | Source |
|---|---|
| Cross-tenant leak suite green | Principle II, Definition of Done |
| RLS coverage across every tenant-scoped table | Constitution, Technology Constraints |
| No-tenant-context case (V15) green for every tenant-scoped table | Constitution v1.3.0 |
| Role attribute verification | [D4](./research.md#d4--rls-shape-and-the-role-configuration-that-actually-enforces-it) |
| Audit entry asserted for every mutation | Principle V, Definition of Done |
| Blocking coverage on tenant isolation | Constitution's non-negotiable critical coverage list |
| Secret scanning | Principle VI |
| Dependency scanning, no critical CVEs | Constitution, Dependencies and Infrastructure |

## What this slice does not deliver

No sign-in, no session, no MFA, no user interface, no entitlement enforcement, and no
audit export. Identity and membership come from fixtures — slice 002 supplies the
real ones. This slice contributes items 2, 3 and part of 6 of the constitution's
six-item walking skeleton; items 1, 4 and 5 arrive with slices 002 to 004.
