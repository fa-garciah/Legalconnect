# Implementation Plan: Authorization & Tier Entitlements

**Branch**: `004-authorization-entitlements` | **Date**: 2026-08-26
**Spec**: [spec.md](./spec.md) | **Constitution**: v1.4.0

**Input**: Feature specification from `/specs/004-authorization-entitlements/spec.md`

---

## Summary

Slice 002 shipped the *subject* of authorization — `membership.archetype`, a ten-value
enum, resolved per request and provably not overridable by a client claim (its V19). It
enforced its own twelve-capability matrix largely **at the data layer**, through grants
and RLS rather than through application code.

What does not exist is a decision *mechanism*. Constitution Technical Debt item 11 states
it: only `SA` is ever granted anything, and `plan.entitlements` is written and read by
nothing.

This slice adds a **pure decision function** over `(subject, capability, scope, plan)`,
the scope-resolver port that makes per-case authorization possible before cases exist,
and a single global interceptor that applies it to every route on every surface. It
introduces no entity and no table. That is why it can be implemented immediately.

**Decisions taken before this plan** (spec.md, Decisions 1–6 — all resolved):

1. **Scope applies.** Authorization is not archetype-only.
2. **Seniority stays out.** It belongs to the firm directory; this slice reads archetype.
3. **Archetype re-read per request.** Already built that way by 002; must not regress.
4. **Archetypes are fixed.** `US12-EP00-FND-DefineRole` is retired from the catalogue as
   a duplicate of `US13`. No per-tenant capability override table; the matrix is a
   compile-time constant.
5. **`002`'s Principle I entry claims `US13` and `US15`**, which it built. This slice
   claims `US11` and `US14`.
6. **This slice does not narrow `MP`** *(resolved 2026-08-26)*. `MP` keeps the four
   capabilities 002 shipped it and does not gain the audit-log read. FR-028's enumeration
   of differences is therefore **empty**: no route declaration changes, and 002's matrix
   needs no amendment.

### What Phase 0 changed about the approach

Two assumptions carried into planning did not survive contact with `backend/src`, and
both are load-bearing. They are recorded here because they change the shape of the work,
not merely its detail.

| Assumed | Actually |
|---|---|
| Archetype **and plan** are already resolved by the existing `MembershipPort` lookup, so entitlement adds no query | Archetype is; **the plan is not** — `MembershipRecord` has no plan field. Resolved by widening `DbMembershipPort`'s existing single `SELECT` with two joins, keeping "no added query" literally true (research.md D7) |
| One NestJS **guard** carries the decision | A Guard cannot see the principal or the plan — Nest runs Guards before every Interceptor. This is settled in the codebase and is why [`permissions/guard.ts`](../../backend/src/common/permissions/guard.ts) contains no guard. Resolved by an **interceptor** (research.md D2) |

And two things planning had not reached, found by reading the interceptors:

- **The platform and identity surfaces bypass every archetype check today.**
  `TenantContextInterceptor` returns early for both, so **8 of the 21 matrix rows sit on
  code paths no decision has ever run on.** A decision mechanism scoped to the tenant
  surface would cover the matrix partially and claim to cover it wholly.
- **Rows 9 and 10 cannot be archetype-decided at all** — at the moment of accepting an
  invitation the caller has no membership, so there is no archetype (research.md D8).

---

## Technical Context

Inherits slices 001 and 002 in full. Only what is new is elaborated.

**Language/Version**: TypeScript — **fixed by constitution**. Same Node.js LTS.

**Primary Dependencies**: NestJS + Drizzle — **fixed**, unchanged. **No new runtime
dependency.** The decision function is arithmetic over data already loaded on the hot path.

**Storage**: PostgreSQL with RLS — unchanged. **No new table.** Two migration numbers:
`0019` adds a trigger that only ever refuses; `0020` is reserved for a grant audit and is
expected to be dropped unused. See Complexity Tracking.

**Testing**: Vitest, Testcontainers, real PostgreSQL as the real non-owner application
role. This slice's distinguishing property is that its core is testable **without an HTTP
request and without a database** — a pure function admits exhaustive enumeration rather
than sampling. Blocking suites: full matrix enumeration, unenumerated-capability refusal,
portal archetypes holding nothing, refusal ordering, and `PO` refused every tenant-scoped
capability.

**Target Platform**: AWS ECS Fargate — unchanged. **This slice needs no AWS access to
build or test**, which is what makes it runnable now.

**Project Type**: Web application, modular monolith. Backend only; no UI.
Permission-derived navigation is a frontend slice (014) and is a projection of this
module, never an authority.

**Performance Goals**: The decision runs on the per-request hot path 001 already budgets
for. It adds **zero queries** for the `tenant`, `self` and `none` scope kinds: archetype
comes from `currentPrincipal()` in `AsyncLocalStorage` (synchronous), and the plan is
joined into the `SELECT` `DbMembershipPort` already runs (research.md D7). The `assigned`
kind will add one lookup when its resolver arrives; that cost belongs to the slice that
supplies it.

**Constraints**:
- Every constraint of 001 and 002 applies unchanged.
- **This slice may not widen any grant.** 002's enforcement rests on the ordinary role
  holding no `INSERT` on `membership` and no general grant on `identity`. Nothing here
  relaxes that. It adds no `INSERT`, no `UPDATE`, no role and no policy.
- Refusals disclose neither existence nor shape of the refused resource.
- Coverage of refusal paths is **blocking in CI**, at the standing of tenant isolation.

**Scale/Scope**: Zero owned entities. Two claimed stories (`US11`, `US14`). One decision
function, one port, four scope kinds (three resolvers shipped here, one deferred), 21
capability rows. One interceptor. One trigger. No UI, no AWS, no external service.

**Open at constitution level, not resolvable here**:
- **PAC selection** `[PENDING]` — no effect; blocks the CFDI slice only.
- **Cognito passkeys in `mx-central-1`** — no effect; blocks slice 003 only.

---

## Constitution Check

### Initial gate — before Phase 0

| # | Principle | Verdict | Basis |
|---|---|---|---|
| I | Spec-First Delivery (NON-NEGOTIABLE) | ✅ PASS | `US11` and `US14` are in the catalogue. Both catalogue amendments have **already landed**: `master-user-story-catalog.md` records `US12`'s retirement, and `002/plan.md`'s Principle I row claims `US13`/`US15` (corrected 2026-08-21). Verified, not assumed. One tidy-up remains — see Open Items 1. |
| II | Tenant Isolation (NON-NEGOTIABLE) | ✅ PASS | Adds no data path. Strengthens the principle: `PO` is provably refused every tenant-scoped capability, which 002 asserted only for its own twelve. |
| III | Product Core vs. Tenant Customization | ✅ PASS | Decision 4 keeps archetypes fixed. Had `US12` resolved to per-tenant capability overrides, this row would read ⚠️ and require justification. Zero tenant identifiers in the matrix. |
| IV | Least Privilege by Default | ✅ PASS | This slice *is* the principle. Deny-by-default is asserted by enumeration, not by intent. |
| V | Auditability | ✅ PASS | `membership.archetype_changed` already exists (002). No new action needed; refused cross-tenant reaches continue to emit `tenant.cross_access_attempted` (001 US10). |
| VI | Data Minimisation | ✅ PASS | Reads archetype and plan. Touches no case content, no client PII. |

### Re-check — after Phase 1 design

| # | Principle | Verdict | What the design actually does |
|---|---|---|---|
| I | Spec-First Delivery | ✅ PASS | No design artefact introduces a requirement absent from `spec.md`. Where the design *interprets* the spec — research.md D8, on rows 9–10 — it is flagged for confirmation rather than applied silently. Q2 was resolved **in the spec** and the plan follows it. |
| II | Tenant Isolation | ✅ PASS | `AuthorizationInterceptor` nests *inside* the tenant transaction, so a scope resolver reads under the same `app.tenant_id` and the same RLS as the handler. The plan join added to `DbMembershipPort` reads `tenant` under the RLS policy that restricts it to the row already named by `app.tenant_id`, and `plan`, which is global product configuration with no `tenant_id`. **No new cross-tenant read exists to test.** |
| III | Product Core vs. Tenant Customization | ✅ PASS | `matrix.ts` is a constant, identical for every tenant. `plan.entitlements` is per-**plan**, not per-tenant — a tier is a product concept, and "everything enabled for a single tenant" is expressed by that tenant's plan, not by a branch in the core. |
| IV | Least Privilege by Default | ✅ **PASS — the row to watch, and it holds** | **No capability is decided inside a controller.** Controllers carry `@Capability('id')` — a declaration, not a rule. Every rule lives in `matrix.ts`, and the only code that reads it is `decide()`. The check that would have failed this row is the one the design deliberately avoided: putting a guard on `membership.service.ts` while leaving `@RequireArchetypes` in place elsewhere. `@RequireArchetypes` is **deleted**, not supplemented. |
| V | Auditability | ✅ PASS | Vocabulary unchanged — 16 actions, no addition. In-tenant refusals are deliberately silent, for the self-amplification reason that already put two actions behind `001/FR-025`'s channel gate; recorded in `contracts/refusal.md` §4 as a decision. |
| VI | Data Minimisation | ✅ PASS | The two refusal payloads that name something (`capability`, `limit.key`/`limit.value`) carry a product identifier and a configured ceiling. No usage count, no personal data, no client identifier. |

**One deviation from the constitution's Technology Constraints table**, not from a
principle: it still reads *"Tier entitlement → Global guard"*. See Complexity Tracking.

---

## Project Structure

### Documentation (this feature)

```text
specs/004-authorization-entitlements/
├── spec.md              # amended 2026-08-26: Q1/Q2 closed, 0 clarifications
├── plan.md              # this file
├── research.md          # Phase 0 — D1..D10
├── data-model.md        # Phase 1 — no tables; the registry, matrix and Decision shapes
├── contracts/
│   └── refusal.md       # Phase 1 — normative for every slice downstream
├── quickstart.md        # Phase 1 — 8 validation scenarios
├── checklists/
│   └── requirements.md  # existing
└── tasks.md             # /speckit-tasks — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── common/
│   │   ├── authz/                        # NEW — the whole slice
│   │   │   ├── capability.ts             # registry: id, scope kind, tier/limit key, step-up
│   │   │   ├── matrix.ts                 # subject x capability, a constant (Decision 4)
│   │   │   ├── decide.ts                 # the pure function -> Decision
│   │   │   ├── scope.ts                  # ScopeResolverPort + tenant/self/none resolvers
│   │   │   ├── entitlement.ts            # plan.entitlements + plan.limits evaluation
│   │   │   ├── refusal.ts                # the four ordered reasons, and their HTTP mapping
│   │   │   ├── declare.ts                # @Capability() metadata — no rule authored here
│   │   │   └── interceptor.ts            # the single global decision point (D2)
│   │   ├── permissions/
│   │   │   └── guard.ts                  # MODIFIED: @RequireArchetypes DELETED;
│   │   │                                 #   PlatformSurface/IdentitySurface stay
│   │   └── tenant/
│   │       ├── principal.ts              # MODIFIED: ActivePrincipal gains `plan`
│   │       ├── membership.ts             # MODIFIED: MembershipRecord gains plan fields;
│   │       │                             #   DbMembershipPort's SELECT gains two joins
│   │       └── middleware.ts             # MODIFIED: archetype check removed (moves to authz)
│   ├── modules/
│   │   ├── audit/audit.controller.ts     # MODIFIED: @RequireArchetypes -> @Capability
│   │   ├── invitation/invitation.controller.ts     # MODIFIED: 3 routes
│   │   ├── membership/
│   │   │   ├── membership.controller.ts  # MODIFIED: 2 routes
│   │   │   └── membership.service.ts     # MODIFIED: maps SQLSTATE 23001 -> refusal
│   │   ├── identity/*.controller.ts      # MODIFIED: @Capability on both identity routes
│   │   ├── tenant/*.controller.ts        # MODIFIED: @Capability on the platform routes
│   │   └── plan/plan.controller.ts       # MODIFIED: @Capability on both routes
│   └── app.module.ts                     # MODIFIED: registers AuthorizationInterceptor
├── drizzle/
│   ├── 0019_membership_retain_one_sa.sql # the last-SA trigger (research.md D5)
│   └── 0020_authz_grant_verification.sql # RESERVED — dropped if the audit finds nothing
├── vitest.config.ts                      # MODIFIED: src/common/authz/** at 100%, blocking
└── tests/
    ├── unit/                                   # no database, no HTTP, no container
    │   ├── matrix-exhaustive.test.ts           # every (subject x capability) pair
    │   ├── deny-by-default.test.ts             # unenumerated capability refused for all
    │   ├── portal-archetypes-empty.test.ts     # CC/IC/CB/EL hold nothing tenant-scoped
    │   ├── refusal-ordering.test.ts            # mfa -> permission -> scope -> entitlement
    │   ├── entitlement.test.ts                 # tier gate and limit shape, archetype-independent
    │   └── scope-resolver.test.ts              # stub assigned resolver; missing resolver refuses
    ├── contract/
    │   ├── capability-declared-everywhere.test.ts  # 0 undeclared routes (SC-013)
    │   └── refusal-shapes.test.ts                  # the wire mapping of contracts/refusal.md
    └── integration/
        ├── po-refused-everything.test.ts       # PO x every tenant-scoped capability
        ├── entitlement-no-deploy.test.ts       # mapping change takes effect next request
        ├── last-sa-protected.test.ts           # includes the CONCURRENT demotion case
        └── archetype-change-live.test.ts       # demotion takes effect on the next request
```

**Structure Decision.** `common/authz/` sits beside `common/tenant/` and
`common/identity/`, the same shape 002 used for the identity-only context. It is
deliberately a *common* concern and not a module — it has no routes of its own.
`interceptor.ts` and `declare.ts` are the only files NestJS sees; everything above them
is plain TypeScript with no framework import, which is what makes the exhaustive unit
suite run without Testcontainers.

`matrix.ts` is a constant because of Decision 4. **If that decision is ever revisited,
this one file becomes a repository and every test in `unit/` changes shape.** Worth
knowing which file carries that risk.

The modified list is longer than the draft anticipated, and all of the growth is
`@RequireArchetypes` → `@Capability` migration plus `@Capability` on the eleven
platform and identity routes that carry no declaration at all today. That migration is
mechanical, and it is the work that closes FR-019 (research.md D2).

---

## Phase 0 — research.md ✅ complete

| # | Decision | Outcome |
|---|---|---|
| D1 | Capability identity | `const` registry object; `CapabilityId = keyof typeof`; matrix is a total `Record`, so a missing row is a **compile error** |
| D2 | Where the decision runs | A fourth global **interceptor**, after both context interceptors, on **all three surfaces**. Not a guard — a guard cannot see the principal or the plan |
| D3 | `ScopeResolverPort` shape | Keyed by scope **kind**, collected via a DI multi-provider. The cases slice registers `assigned` from its own module, editing nothing in `common/authz/` |
| D4 | Entitlement evaluation | One class, two shapes: feature flag and quantitative limit. No capability in this matrix reaches a limit; the mechanism and its shape ship tested |
| D5 | Last-`SA` invariant | A **`BEFORE UPDATE` trigger** taking `FOR UPDATE` on sibling `SA` rows. An application check cannot deliver SC-009's *0 sequences* under concurrency |
| D6 | Refusal HTTP mapping | Decided for everything this slice ships. `assigned` recommended 404 and **deferred** — no row in this matrix uses that kind |
| D7 | Entitlement caching | **No cache.** The plan joins into the `SELECT` that already runs, so the read is free and there is nothing to invalidate |
| D8 | Rows 9–10 | Identity-surface capabilities are decided by identity, not archetype. FR-020 is read as *zero tenant-scoped capability*. **Flagged** |
| D9 | `PO`'s subject | Derived from the route's `@PlatformSurface()` declaration, not from a claim. Nothing the caller supplies participates |
| D10 | Grant audit | Verify `tenant` and `plan`; expect no finding; drop `0020` if none |

## Phase 1 — design output ✅ complete

- **[data-model.md](./data-model.md)** — records that no table is added, specifies the
  registry, all 21 capability rows with ids and scope kinds, the matrix as resolved, the
  `Decision` type, and the three seam widenings to entities that already exist.
- **[contracts/refusal.md](./contracts/refusal.md)** — **the important artefact.** Every
  later slice consumes the refusal contract, so it belongs here and is referenced, never
  restated downstream. Carries the ordering, the wire mapping, the non-disclosure rules,
  the audit consequences, and what a downstream slice owes the contract.
- **[quickstart.md](./quickstart.md)** — eight runnable validation scenarios, each naming
  what it proves and the requirement it proves it against.

---

## Complexity Tracking

| Deviation | Why | Alternative rejected |
|---|---|---|
| **The entitlement check is an interceptor, where the constitution's Technology Constraints table says "Global guard"** | Unimplementable as written, for exactly the reason v1.4.0 already corrected the two rows above it: Nest runs Guards before every Interceptor, and entitlement depends on the tenant's **plan**, which does not exist until `TenantContextInterceptor` has resolved a principal. A Guard would find no tenant on every request. v1.4.0 corrected rows 1 and 2 and missed row 3. **Carried to a v1.4.1 amendment PR** in the same shape as the existing correction. | A Guard reading the plan from a header or a cache — that is FR-003 and FR-027 both violated, to satisfy a table row that the same table's own correction note already contradicts. |
| **A migration in a slice that owns no table** (`0019`) | The last-`SA` invariant is a concurrency invariant, and SC-009 says *0 sequences* leave a tenant with zero live `SA`. A check-then-write in the service passes every sequential test and loses the concurrent one. The trigger locks sibling rows and cannot. It also covers archetype change and revocation with **one** rule, where the application would need two. | An application check in `membership.service.ts` — sequentially correct, racy under concurrency, and duplicated across two call sites. |
| **A second migration number reserved and expected to go unused** (`0020`) | 002's `quickstart-results` deviation 5 found `lc_app`'s `audit_event` grant wider than intended and narrowed it in `0018`. That gap was invisible until someone looked. This slice is the first to put `tenant` and `plan` on the ordinary role's per-request path, so it is the natural place to look again. **Expected finding: none**; the file is dropped from the branch if the assertions pass. | Leaving grant verification to a later slice — the gap 002 found was invisible until someone looked. |
| **`@RequireArchetypes` is deleted rather than kept alongside `@Capability`** | Grants prohibit; they do not decide. Archetype change is `SA`-only, and that rule now lives in `matrix.ts` rather than in two places. Keeping both would be two sources of truth for one rule, and Principle IV's re-check would fail. | Leaving the rule in the decorator and adding the module beside it — two sources of truth for one capability is how they diverge. |
| **Eleven platform and identity routes gain a declaration they never had** | They bypass `TenantContextInterceptor` entirely today, so 8 of 21 matrix rows sit on code paths no decision has ever run on. FR-019 says an endpoint declaring no capability is unreachable; scoping that to one surface would satisfy the sentence and not the requirement. | Deciding only on the tenant surface — it covers 13 of 21 rows and reports covering all of them. |

**No principle is violated by this plan.** If Decision 4 is ever revisited toward
per-tenant overrides, Principle III moves to ⚠️ and requires justification in this section.

---

## Open items for the CC technical lead

Ordered by when an answer is needed. **None blocks `/speckit-tasks`.**

1. **Catalogue tidy-up — cosmetic, not blocking.** Both substantive amendments have
   landed. Two placement defects remain: `US12`'s retirement note sits under **EP01**'s
   table rather than EP00's, and EP00's own summary line still reads *"US11–US15 → slice
   004"* when `US13`/`US15` belong to 002 and `US12` is retired. One PR, one file.

2. **Rows 9 and 10 — confirm the reading** *(research.md D8)*. This is the plan
   interpreting the spec, and it should be signed off rather than discovered later.
   FR-020 says the portal archetypes hold zero capabilities. Read literally, the
   exhaustive test refuses `CC`/`IC`/`CB`/`EL` the right to accept their own invitation
   — which breaks a capability 002 shipped, and which is anyway undecidable, because at
   the moment of accepting there is **no membership and therefore no archetype**. The
   design reads FR-020 as *zero **tenant-scoped** capability*, which preserves the
   property the portal epic needs. **If rejected**, the alternative is to amend 002 so a
   portal archetype cannot be invited at all — a larger change, in a different slice.

3. **Scope refusal: 403 or 404?** — **RESOLVED 2026-08-27: 404**, by slice
   `006-client-case-core`'s Decision 4, which is the slice this item named as the one where
   the answer becomes observable. FR-017 and US5 scenario 3 above were amended in the same
   change, exactly as this item required. The remaining text is kept for the reasoning.
   *(research.md D6)* A 403 on an entity the caller is not
   assigned to confirms the entity exists. For a firm running an ethical wall, that
   confirmation may itself be the protected fact. **Recommend 404**, and recommend it be
   decided by someone who can speak to the professional-privilege consequence rather than
   to the HTTP convention. **Not urgent**: no capability in this slice's matrix resolves
   at `assigned` scope, so the answer is first observable in the clients-and-cases slice.
   If 404 is taken, FR-017 and US5 scenario 3 are amended in the same PR to say the
   distinction is drawn in the audit trail and the `Decision` type, not on the wire.

4. **Which capabilities are tier-gated at launch?** The mechanism is cross-cutting and is
   built regardless; the mapping is configuration. Today **no capability carries a `tier`
   key**, so every one of the 21 is included in every plan — which is a defensible launch
   state and a deliberate one, but it needs an owner. It is a commercial decision tied to
   the three iguala tiers, not a technical one.

5. **`plan.entitlements` has never been read by anything.** Its current contents are
   whatever 001 seeded. Someone should confirm the keys are the ones the product will
   actually use before code depends on them. Related to 4 and answerable with it.

6. **Step-up MFA still gates production exposure of five capabilities** — rows 2, 3, 6, 7
   and 17. Inherited from 002 unchanged; this slice marks them `stepUp: true` in the
   registry so the constraint is machine-readable rather than a note in prose. Slice 005
   supplies the mechanism.
