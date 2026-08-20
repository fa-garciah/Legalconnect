# Implementation Plan: Tenant Foundation & Audit Log

**Branch**: `001-tenant-foundation` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-tenant-foundation/spec.md`

**Status**: Phase 0 and Phase 1 complete. Ready for `/speckit-tasks`, with one
merge-blocking governance item and four decisions listed for the CC technical lead.

## Summary

Establish the two mechanisms every later slice depends on: absolute tenant isolation
enforced at the data layer, and an append-only audit log. Delivers
nine EP00-FND catalog stories — US01 through US08 and US10.

The technical approach is largely predetermined by the constitution rather than
chosen here — PostgreSQL Row-Level Security with `tenant_id` on every table,
`SET LOCAL app.tenant_id` per transaction, a global tenant middleware, and a global
audit interceptor over every mutation. This slice's engineering work is installing
those cross-cutting mechanisms correctly, not designing them.

Two decisions were genuinely open and are now closed. A person **may** hold access
to more than one tenant, so identity and membership are separate concepts
([D1](./research.md#d1--a-person-may-hold-access-to-more-than-one-tenant)) — this
closes Constitution Technical Debt item 8. Audit entries are retained **24 months**
([D2](./research.md#d2--audit-retention-is-24-months)).

## Technical Context

Values marked **fixed by constitution** cannot be changed without a formal amendment.

**Language/Version**: TypeScript — **fixed by constitution**. Node.js LTS; exact major version is an unconstrained setup choice.

**Primary Dependencies**: NestJS (**fixed**, derived from Principles II/IV/V) + Drizzle ORM (**fixed**; Prisma **prohibited** for unreliable `SET LOCAL` under pooling — acceptable alternative is `pg` with direct SQL). Next.js/React exists in the stack but is not exercised by this slice.

**Storage**: PostgreSQL on RDS with **enforced Row-Level Security**, shared schema, `tenant_id` on every tenant table — **fixed by constitution**. S3, KMS, SQS for files, keys and queues.

**Testing**: Strict TDD, mandatory. Vitest + Testcontainers + Supertest ([D11](./research.md#d11--isolation-tests-run-against-real-postgresql-as-the-real-role)); the runner is unconstrained by the constitution, but real PostgreSQL is not optional — RLS cannot be exercised against a mock without producing tests that pass while proving nothing.

**Target Platform**: AWS ECS Fargate, Linux containers — **fixed**. Kubernetes prohibited.

**Project Type**: Web application, **modular monolith, single deployment**. Microservices, GraphQL, CQRS, WebSockets and dynamic modules are out of MVP scope. Backend and infrastructure only in this slice; no UI.

**Performance Goals**: SC-010 — first page of an audit query over full retained history under 3 seconds, served by monthly partition pruning ([D7](./research.md#d7--monthly-range-partitioning-carries-retention-and-the-latency-target)).

**Constraints**:
- TLS 1.2+ in transit, encryption at rest, no exception.
- The application database role **must not** be superuser, **must not** own tables, **must not** hold `BYPASSRLS`. Asserted at startup, not merely configured.
- Secrets never in repository, logs or error messages.
- End-client personal data never in application logs.
- Backups in the same jurisdiction as primary data.

**Scale/Scope**: This slice — 3 owned entities, 5 user stories, 6 audit actions, no UI. Forward constraint: with EP13 active, external users are projected at roughly 10:1 over internal per tenant, which is why retention and partitioning are design inputs here rather than later tuning.

**Open at constitution level, not resolvable in this slice**:
- **AWS region** `[PENDING]` — blocks production deployment, not design. Required in the privacy notice under LFPDPPP; constrains backup jurisdiction.
- **External IdP** `[PENDING]` — no effect here (no identity is built), required before slice 002.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against constitution **v1.3.0**.

### Initial gate — before Phase 0

| # | Principle | Verdict | Basis |
|---|---|---|---|
| I | Spec-First Delivery (NON-NEGOTIABLE) | ✅ PASS | `spec.md` precedes this plan and this plan introduces no requirement absent from it. `specs/master-user-story-catalog.md` is now present — 169 stories, EP00–EP16, EP00-PlatformFoundation registered with 15 — so every story this slice delivers is traceable and a PR can carry an acceptable reference. Installing it also corrected two wrong story IDs in the spec and revealed the slice delivers nine catalog stories rather than five; see Closed items. |
| II | Tenant Isolation is Absolute (NON-NEGOTIABLE) | ✅ PASS | Unblocked by D1. Mechanism: RLS with `USING` **and** `WITH CHECK` on every tenant table, `SET LOCAL` per transaction from global middleware, non-owner application role, CI coverage check, per-path leak tests. Two deliberate cross-tenant exceptions are documented in Complexity Tracking. |
| III | Product Core vs. Tenant Customization | ✅ PASS | No client identifier anywhere. Tier is data on `Tenant`; limits and feature mapping are configuration. Nothing branches on a specific tenant. |
| IV | Least Privilege by Default | ✅ PASS | `spec.md` declares a deny-by-default permission matrix; per FR-024 every entry is a **membership** archetype. Hard-delete and audit mutation are held by no archetype. One coupling to slice 004 — open item 2. |
| V | Auditable by Construction | ✅ PASS | Append-only log, six required fields, no update/delete grant, and FR-017 atomicity via same-transaction append ([D6](./research.md#d6--the-audit-entry-is-written-in-the-mutations-own-transaction)). One enumeration gap found — open item 3. |
| VI | Compliance-by-Design | ✅ PASS | Unblocked by D2: audit retention is 24 months with a deletion routine, satisfying *"retention and deletion policies defined per entity before go-live"*. TLS, at-rest encryption, minimisation, secrets-manager-only and no-personal-data-in-logs are reflected in Constraints. Region remains a constitution-level pending. |

**Additional gates**: strict TDD with tests ordered first ✅ (migrations and IaC fall under exemption 1); blocking coverage on tenant isolation ✅; Definition of Done additions ✅; MVP prohibitions respected ✅; English throughout ✅; walking skeleton items 2, 3 and part of 6 delivered ✅.

**Gate result: PASSED.** Phase 0 and Phase 1 are complete and no principle is
outstanding. The Principle I merge gate that qualified the previous revision is
closed.

**Null-safe RLS predicate (v1.3.0)**: this plan's artifacts were written against
v1.2.0, which did not carry the rule, and used the bare `current_setting` form. They
have been corrected — `data-model.md` now states the mandated
`NULLIF(current_setting('app.tenant_id', true), '')::uuid` form for every policy,
`research.md` D3 cites the constitution instead of reasoning about it locally, and
`quickstart.md` V15 adds the no-context-active case the rule requires for every
tenant-scoped table.

### Re-check — after Phase 1 design

No principle moved. Three things the design surfaced, none of which changes a verdict:

- **Principle II now has two documented cross-tenant exceptions** rather than none — the platform administration role and the audit-append definer function. Both are in Complexity Tracking. The constitution requires them documented and justified there; undocumented, they would block the merge.
- **Principle V is stronger than the spec required.** FR-017 asked that an unaudited mutation not take effect; the design achieves it by putting the append in the mutation's transaction, which also fixed the audit log's home in PostgreSQL rather than an external sink. The immutability trade-off that follows is stated in D6 rather than glossed.
- **Principle IV's enforcement seam is not wholly inside this slice.** FR-013's "authorized role" needs the global guard that slice 004 owns. Open item 2.

### Correction to the pre-Phase-0 assessment

The earlier blocked revision of this plan said the multi-tenant decision would force
`data-model.md` and the tenant-context contract to be *"written twice."* That
overstated the coupling in one direction. Because isolation runs through
`SET LOCAL app.tenant_id`, the RLS predicate on business tables is **identical**
under either answer — the session has already resolved which tenant is active.

What actually changes is narrower and still real: how the active tenant is derived
and verified. Under one-tenant-per-user the middleware reads a tenant off the
identity; under D1 it must accept an explicit tenant and verify a live membership
before activating it (FR-022), and archetypes attach to memberships rather than
identities (FR-024). That is a different contract for the very middleware this slice
builds, which is why the decision genuinely had to precede this plan — but the
data-model impact lands mostly in slice 002, not here.

## Project Structure

### Documentation (this feature)

```text
specs/001-tenant-foundation/
├── spec.md                      # Complete — 16/16 checklist items pass
├── checklists/requirements.md   # Complete
├── plan.md                      # This file
├── research.md                  # Phase 0 — 13 decisions
├── data-model.md                # Phase 1 — 3 owned entities, 2 at the slice boundary
├── contracts/
│   ├── README.md                # Surfaces, conventions, the 404-not-403 rule
│   ├── platform-admin.md        # Provision, deactivate, plan, limits
│   ├── audit-query.md           # Tenant-scoped audit read
│   └── tenant-context.md        # The internal isolation mechanism
├── quickstart.md                # Phase 1 — 14 validation scenarios
└── tasks.md                     # Phase 2 — /speckit-tasks, not this command
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── common/
│   │   ├── tenant/            # global middleware: verify membership, SET LOCAL, fail closed
│   │   ├── audit/             # global interceptor: append in the mutation's transaction
│   │   ├── permissions/       # global guard shell (see open item 2)
│   │   └── db/                # Drizzle client bound to the non-owner application role
│   ├── modules/
│   │   ├── tenant/            # provisioning, deactivation — platform context
│   │   ├── plan/              # tier assignment, configurable limits
│   │   └── audit/             # tenant-scoped, cursor-paginated read
│   └── main.ts                # startup role assertion before serving
├── drizzle/                   # declarative migrations: tables, RLS policies, roles,
│                              #   monthly partitions, definer function (TDD exemption 1)
└── tests/
    ├── contract/
    ├── integration/
    │   └── isolation/         # cross-tenant leak suite — merge gate
    └── unit/

infra/                         # IaC, no manual production changes (TDD exemption 1)
.github/workflows/             # secret scan, dependency scan, blocking coverage, RLS check
```

**Structure Decision**: Web application layout, backend only. No `frontend/` tree —
`spec.md` assumes no UI and provisioning is internal (FR-009). `modules/` follows the
owned entities; `common/` holds the four concerns the constitution requires to be
global rather than per-endpoint, and `permissions/` appears there as a shell so slice
004 fills a seam rather than retrofitting one.
`tests/integration/isolation/` is its own directory because its contents are a merge
gate, not ordinary tests.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

Two deliberate deviations from a literal reading of Principle II. The constitution
requires them documented and justified here; undocumented, they block the merge.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Platform administration role reads and writes across tenants** (FR-009, [D9](./research.md#d9--the-platform-administration-context-is-a-second-role-not-a-privileged-path)) | Provisioning a tenant, deactivating it and changing its plan are inherently cross-tenant: no tenant session can create a tenant that does not yet exist. Confined to a separate database role on a separate connection, reaching the `tenant`, `plan` and `audit_event` tables **only** — no business table, so no case file is reachable across tenants. | A bypass flag inside the tenant middleware was rejected: it would place a "disable isolation" switch on the path every business request traverses, where any future endpoint could reach it. A separate role leaves the tenant path with no such switch to find. Self-service provisioning was rejected as out of scope by `spec.md`. |
| **A `SECURITY DEFINER` function appends an audit row outside the active tenant** ([D8](./research.md#d8--recording-a-cross-tenant-attempt-without-leaking-the-actors-other-tenants)) | AS-02 requires a cross-tenant attempt to be recorded against the **targeted** tenant so the affected firm sees it. At that moment the active tenant is the actor's, so the target table's `WITH CHECK` refuses the insert. The function's only capability is appending an audit row, and it is covered by a test asserting it can do nothing else. | Loosening the audit table's `WITH CHECK` was rejected — it would permit any code path to write an entry under any tenant. Recording the attempt only in the *actor's* log was rejected because the firm that was targeted is the one with a reason to know. Skipping the record was rejected: AS-02 requires it. |

Neither exception weakens the guarantee for business data. Both are narrow, both are
named, and both carry a test asserting their limits.

## Open items for the CC technical lead

Four of the six items raised across revisions are now closed. Two remain, and
**neither blocks `/speckit-tasks`.**

### Closed in this revision

- **✅ The user story catalog is installed.** `specs/master-user-story-catalog.md` is present — 169 stories across EP00–EP16, with EP00-PlatformFoundation registered at 15. Principle I is satisfied and the merge gate is closed.

  **Installing it also corrected this spec.** Two of the five story IDs the spec claimed do not exist in the catalog: `US04-EP00-FND-WriteAuditEvent` and `US05-EP00-FND-QueryAuditLog`. The catalog assigns US04 to DeactivateTenant and US05 to ConfigureTenantLimits, placing audit writing at US06, immutability at US07, log query at US08 and cross-tenant logging at US10. The spec now cites the real IDs — and it turns out to deliver **nine** catalog stories rather than five, because deactivation, limit configuration, audit immutability and cross-tenant attempt logging were all already specified without being credited. Had the catalog arrived after implementation began, those PRs would have carried IDs that do not exist.

- **✅ FR-014 amended — now seven events.** `plan.limits_changed` and `tenant.registry_read` are both first-class audited actions in `spec.md` and the action vocabulary, rather than flagged proposals.

- **✅ Audit self-amplification resolved.** FR-025 gates `audit.queried` on `source.channel = 'interactive'`. Automated reads emit nothing, so a monitoring job can no longer inflate the log it is reading. Asserted in both directions by quickstart V9.

- **✅ Platform registry reads are now audited.** FR-026 adds `tenant.registry_read` under the same channel gate. The registry carries every firm's name, RFC and commercial plan, so browsing it is exactly the access Principle V wants traced — and it was the one read that was not. D9 gained a one-line note rather than a duplicated rationale: the narrowing there bounds what the platform role *can* reach, this entry records when it *did*. Asserted in both directions by quickstart V13.

### Still open — neither blocking

1. **FR-013's "authorized role" spans two slices.** The audit read needs the global permission guard that slice 004 owns, and the constitution forbids applying that concern per endpoint. Either slice 001 ships the guard as a global shell permitting only SA, with 004 filling in the matrix behind the same seam **(recommended)**, or `GET /audit/events` moves to slice 004 and 001 ships audit writing only. The second changes the scope of two specs, so it is not decided here. Detail in [contracts/audit-query.md](./contracts/audit-query.md).
2. **How much actor detail may the targeted firm see?** D8 writes a deliberately thin record so firm B cannot learn that firm A exists and is adjacent to its matter. Whether the targeted firm is entitled to more, and whether the acting firm's log should carry the fuller record, is a question for counsel. The mechanism supports either; only column contents change.

Two follow-ups for the constitution itself, neither blocking: **Technical Debt item 8
is closed by D1 but is still present in the document** (line 449) and should be struck
at the next amendment; and `CC` remains overloaded — it denotes both Cosmic Chimps and
a portal archetype in Principle IV and the Sessions section. Note the catalog uses
"CC Platform Operator" for the vendor role, which matches this spec's usage.
