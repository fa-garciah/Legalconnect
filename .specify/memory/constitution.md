# LegalConnect MX — Constitution

Governing document of the project. Spec Kit evaluates this document on every
`/plan` (Constitution Check). A `plan.md` that violates a principle must document
the violation in its Complexity Tracking section and justify it; undocumented
violations block the merge.

This constitution governs the **how**, not the **what**. Scope decisions (which
epics enter the MVP, EP13, native mobile app, WhatsApp, Google Calendar) do NOT
live here — they live in the `spec.md` files and in the backlog. If a decision
changes with Discovery and forces an amendment to this document, that is a sign
it was placed in the wrong document.

---

## Core Principles

### I. Spec-First Delivery (NON-NEGOTIABLE)

No code reaches `main` without an approved `spec.md` backing it.
The flow is `spec.md` → `plan.md` → `tasks.md` → implementation. A `plan.md`
cannot introduce requirements absent from its `spec.md`; when a new requirement
appears, the spec is amended, not the plan.

**Verifiable:** every PR references a User Story ID
(`US<NN>-EP<NN>-<ModuleCode>-<Action>`) and its approved spec. A PR without a
traceable reference is rejected automatically.

**Traceability baseline:** the authoritative backlog index is
`master-user-story-catalog.md` (169 user stories across EP00–EP16). It supersedes
`1. Epics.md`. Any user story not present in that catalog does not exist for the
purposes of this principle.

### II. Tenant Isolation is Absolute (NON-NEGOTIABLE)

No query, job, cache, queue, log, file or backup may reach data belonging to more
than one tenant. Tenant scope is enforced at the data layer, not the application
layer: a developer who forgets the filter must get zero rows, not another firm's
rows.

**Verifiable:** every endpoint and every async job has a cross-tenant leak test
(user authenticated in tenant A requests a tenant B resource → 404/403, never
200). That test is part of the Definition of Done, not optional.

**Rationale:** the data is covered by attorney-client privilege. A single
cross-tenant leak between two firms litigating against each other ends the
product and exposes CC to liability. No business, schedule or performance
justification authorises an exception.

### III. Product Core vs. Tenant Customization

The product core is firm-agnostic. Nothing specific to Felipe's firm — or to any
client — enters the core: it lives in per-tenant configuration, feature flags or
extension modules.

**Verifiable:** zero hardcoded client identifiers in the core. Every
firm-specific business rule is resolved through configuration. A `plan.md`
introducing logic conditioned on a specific tenant fails the gate.

**Rationale:** this is the technical evidence that LegalConnect MX is a
commercial product owned by CC and not work-for-hire. While the IP clause in the
development contract remains open, this separation is the asset that sustains
CC's position in the framework agreement negotiation. Multi-tenancy and tier
entitlements are not speculative features: they are the proof that a product
exists.

### IV. Least Privilege by Default

Deny by default. Every permission is explicit. Every `spec.md` involving an
archetype (MP, AA, PL, CM, BM, SA, CC, IC, CB, EL, and the portal roles) declares
its permission matrix: what it may read, write, delete and export.

**Verifiable:** a `spec.md` without a permission matrix does not pass the
Discovery approval gate.

**Note:** the global role matrix is still undefined (April requirements session:
"to be defined once all user types accessing the system are identified"). This
principle builds it incrementally per story rather than blocking development
until it is complete.

### V. Auditable by Construction

Every access to and modification of cases, documents, notes, time entries, quotes
and invoices is recorded in an append-only log: who, what, when, from where, on
which tenant. The log is neither edited nor deleted by normal system operation.

**Verifiable:** the tests for each mutation assert that the corresponding audit
event was emitted. A mutating endpoint without an audit event does not pass code
review.

**Rationale:** evidentiary value toward the firm's own clients, requirement for
servicing ARCO rights under LFPDPPP, foundation for the traceability stories
(US07-EP04-DOC, US13-EP04-DOC), and the only detection net available while the
authentication factor is not phishing-resistant (see Recognised Technical Debt).

### VI. Compliance-by-Design (LFPDPPP + CFDI/SAT)

- Encryption in transit (TLS 1.2+ minimum) and at rest, without exception.
- Minimisation: no personal data is stored unless a user story explicitly
  requires it.
- Secrets (PAC credentials, CSD, private keys, tokens, connection strings) never
  in the repository, never in logs, never in error messages. Secrets manager only.
- Personal data of the firm's end clients never appears in application logs.
- Retention and deletion policies defined per entity before go-live.
- The privacy notice must state the hosting region and any international data
  transfer.

**Verifiable:** blocking secret scanning in CI. Explicit log review in code
review for any endpoint handling personal data.

---

## Security Constraints

### Authentication

- Identity delegated to an **external IdP** (provider: **[PENDING — close before
  end of Fase 0]**). LegalConnect MX stores no passwords.
- **MFA enrollment is MANDATORY** for every user of the system, internal and
  external. No exceptions, and no ability to relax it per tenant.
- **MFA challenge on EVERY sign-in**, for every role. There is no trusted-device
  mechanism and no suppression of the second factor.
  _Rationale:_ every access reaches material covered by attorney-client
  privilege; this product recognises no low-risk role.
- Permitted factors (v1.0):
  - **TOTP** (authenticator app) as the primary factor for all roles.
  - **Email OTP** permitted for low-frequency external portal users.
  - **SMS prohibited as a primary factor** (SIM swap, plus per-message cost on
    every session given the permanent challenge). Permitted only as a
    last-resort fallback.
  - Backup codes mandatory, issued at enrollment.
- The selected IdP **MUST support WebAuthn/passkeys natively**, even though they
  are not enabled in v1.0. Choosing an IdP without that support turns future
  passkey adoption into a provider migration rather than a configuration change.
- **Step-up MFA is mandatory**, regardless of session age, for: creating or
  deactivating users, changes to the permission matrix, uploading or replacing
  PAC/CSD credentials, full case export, and resetting another user's MFA.
- **Access recovery:** every factor reset is recorded in the audit log
  identifying the authorising party. No internal role may reset an external
  user's factor without documented out-of-band verification.
  _Rationale:_ with universal mandatory MFA, the recovery flow becomes the
  weakest attack surface in the system. A phone call cannot be allowed to unlock
  access to a case file.
- Compensating mitigations, mandatory while the primary factor is phishable:
  DMARC/SPF/DKIM enforced on the domain; requesting OTPs via email links is
  prohibited; a single access domain is communicated to users.
- **IdP selection constraint:** per-MAU cost must be modelled against the portal
  user projection before signing. With EP13 active, external users will outnumber
  internal users by roughly 10:1 per tenant, and that cost lands directly on the
  iguala margin.

### Sessions

- Access token: **15 min**. Rotating refresh token (rotation on every use;
  detected reuse revokes the entire token family).
- Internal users (MP, AA, PL, CM, BM): idle **8 h** / absolute **12 h**. No
  "remember me".
- System Administrator (SA): idle **30 min** / absolute **8 h**.
- Portal users (CC, IC, CB, EL, third parties): idle **2 h** / absolute **24 h**.
  No "remember me".
- Internal mobile: device-bound refresh, up to **30 days**, with local biometric
  unlock on every app open.
- Refresh tokens are persisted server-side with device metadata and are
  individually revocable. **Pure stateless JWT is prohibited**:
  US09-EP12-ASC-ViewActiveSessions and US10-EP12-ASC-RevokeSession require it.
  Revocation must also propagate to the IdP.
- Explicit sign-out invalidates the token immediately, server-side and at the IdP.

### Data Residency

Provider fixed: **AWS**. Region: **[PENDING — close before end of Fase 0]**

Constraints that apply regardless of the region chosen:

- The region must appear in the firm's privacy notice.
- Any international transfer must be declared in accordance with LFPDPPP.
- The contractual operator of the infrastructure must be documented, along with
  its legal capacity (data processor), given that cloud is billed as a
  pass-through to the firm.
- Backups reside in the same jurisdiction as the primary data.

### Dependencies and Infrastructure

- Dependency vulnerability scanning in CI. No critical CVEs on `main`.
- No long-lived credentials in CI; short-lived roles only.
- Infrastructure declared as code. No manual changes in production.

---

## Tier Entitlements

The product is sold in three iguala tiers (**Esencial / Profesional / Premium**).
The entitlement mechanism is architected from day one of development.

- Each tenant has an assigned plan. Every restricted feature or limit is verified
  **in the backend** before executing. Hiding controls in the frontend does not
  constitute enforcement.
- Every `spec.md` declares which tier the functionality belongs to, or that it is
  cross-cutting.
- Quantitative limits (users, storage, monthly CFDI issued) are configurable per
  plan without a code deployment.
- The **mapping** of which feature belongs to which tier is configuration and may
  change at any time, including to "everything enabled" for a single tenant. The
  verification **mechanism** is not removed.

**Rationale:** this is the billing mechanic of the iguala. Installing it later
forces an audit and modification of every endpoint already written and reopens
every spec. Furthermore, selling three tiers with software that does not
distinguish them sets the price at the floor: there is no clean way to withdraw
functionality from a client already in production. See also Principle III.

---

## Technology Constraints

The stack is fixed here because several pieces are direct consequences of the
principles rather than preferences. Replacing any element marked **derived from
principle** requires a formal amendment to this constitution.

### Stack

```
Cloud:      AWS — ECS Fargate + RDS PostgreSQL + S3 + KMS + SQS
DB:         PostgreSQL with enforced Row-Level Security
             (shared schema, tenant_id on every table)
Backend:    NestJS (TypeScript) + Drizzle ORM
Frontend:   Next.js (React), responsive web
Auth:       External IdP with native WebAuthn — [PENDING]
CFDI:       PAC with multi-issuer support — [PENDING]
Queues:     SQS + worker inside the same deployment
IaC:        Terraform or CDK (per the infrastructure team's practice)
CI:         GitHub Actions
```

### PostgreSQL with RLS — derived from Principle II

- Tenant isolation is implemented with **Row-Level Security**, not in the
  application layer. Every table holding tenant data carries `tenant_id` and an
  active RLS policy.
- `tenant_id` is set per transaction (`SET LOCAL app.tenant_id`) from middleware.
  No business query filters tenant manually.
- **The Postgres application role must NOT be a superuser, must NOT own the
  tables, and must NOT hold `BYPASSRLS`.** RLS is silently ignored for the table
  owner and for superusers: connecting with the wrong role leaves the policies
  written and the isolation nonexistent, with tests passing.
- **Every RLS predicate MUST use the null-safe form:**
  `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`
  — never the bare form
  `tenant_id = current_setting('app.tenant_id', true)::uuid`.
  _Rationale:_ the missing-ok flag on `current_setting` returns `NULL` the
  first time no value has been set, and that compares to `NULL` — correctly
  invisible, fail-closed. But once a transaction on a pooled connection has set
  the value and then ended, the same call returns `''` (empty string), not
  `NULL`. Casting `''` to `uuid` raises an error. Without `NULLIF`, a request
  that reaches a business query with no active tenant context fails loudly
  (500) instead of failing closed (zero rows) — and the difference is invisible
  in local development, where connections are rarely reused, and only appears
  under pooling in staging or production. This was reproduced directly against
  PostgreSQL 16 with Drizzle before being written here; it is not a theoretical
  concern. This rule applies to every RLS policy in every slice, present and
  future — it does not get re-litigated per feature.
- Mandatory CI test verifying that every table carrying `tenant_id` has RLS
  enabled and an active policy. A new table without a policy breaks the build.
  This catalog check confirms a policy _exists_; it cannot parse whether its
  predicate is null-safe. The non-negotiable tenant-isolation test suite
  (Development Workflow & Quality Gates) MUST therefore include, for every
  tenant-scoped table, a case that opens a connection with no tenant context
  active and asserts zero rows and no error — not just "foreign rows are
  invisible" but "the absence of context produces silence, not a crash." That
  test fails immediately if `NULLIF` is missing, which is what makes this rule
  enforced by construction rather than by memory.

### Drizzle ORM — derived from Principle II

Drizzle is mandatory. **Prisma is prohibited** due to practical incompatibility
with RLS: `SET LOCAL` must execute on the same connection and transaction as the
query, and Prisma does not expose that reliably under pooling. The existing
workarounds are fragile precisely in the mechanism that sustains the only
NON-NEGOTIABLE principle the product's viability depends on. Acceptable
alternative: `pg` with direct SQL.

### NestJS — derived from Principles II, IV and V

The three cross-cutting concerns of this constitution are implemented as global
mechanisms, never per endpoint:

| Requirement                       | Mandatory mechanism                    |
| --------------------------------- | -------------------------------------- |
| Tenant scope (P. II)              | Global middleware                      |
| Permissions per archetype (P. IV) | Global guard                           |
| Tier entitlement                  | Global guard                           |
| Audit event (P. V)                | Global interceptor over every mutation |

An endpoint that requires applying any of these manually is a design violation:
the mechanism must apply by default, and omitting it must be an explicit,
reviewable act rather than a possible oversight.

Framework scope in use: Modules, Controllers + DTOs, Providers/DI, Guards and
Interceptors. Out of MVP scope: microservices, GraphQL, CQRS, WebSockets and
dynamic modules.

### Explicit MVP Prohibitions

Each of these costs more than it contributes within the committed timeline:

- ❌ Kubernetes — ECS Fargate is used instead.
- ❌ Microservices — modular monolith, single deployment.
- ❌ OpenSearch / Elasticsearch — Postgres full-text search covers
  US05-EP04-DOC.
- ❌ Kafka — SQS.
- ❌ GraphQL — REST; no multiple consumers justify it.
- ❌ Offline sync engine — see Recognised Technical Debt.
- ❌ Native mobile app in MVP — responsive web. Pending Discovery.

### PAC Constraints (CFDI 4.0)

- No direct integration with the SAT. An authorised PAC is used.
- **Disqualifying requirement: multi-issuer support.** Each firm is a distinct
  issuer with its own CSD. A PAC that cannot handle multiple issuers per account
  cleanly breaks multi-tenancy in invoicing.
- Additional requirements: functional sandbox, CFDI 4.0, payment complement,
  cancellation with SAT acknowledgement.
- **CSD custody:** the platform stores each firm's CSD private key — material
  with which invoices can be issued in their name. It belongs in a secrets
  manager with KMS, with access recorded in the audit log, and step-up MFA
  mandatory to upload or replace it.

### Walking Skeleton — entry condition to Fase 1

Before day one of Fase 1, a trivial endpoint must exist that traverses the entire
architecture with the non-negotiables already installed:

1. Login against the IdP with MFA end-to-end.
2. Tenant middleware + `SET LOCAL app.tenant_id` + one table with active RLS.
3. Audit interceptor writing to the append-only table.
4. Permission guard and entitlement guard operational.
5. Cross-tenant leak test green.
6. Complete CI pipeline: secret scanning, dependency scanning, blocking coverage,
   RLS verification.

It is built during Fase 0. If the skeleton is not standing at the close of
Fase 0, that is a signal that the stack or the estimate is wrong, and both are
reconsidered before committing to development — not afterwards.

---

## Development Workflow & Quality Gates

### Testing discipline — strict TDD

The cycle is mandatory: **test first → verify it fails → minimum code that makes
it pass → refactor**. No production code is written without a failing test
waiting for it.

**Verifiable:** `tasks.md` orders test tasks before implementation tasks. In code
review, the PR history must evidence the test preceding its corresponding
implementation.

**Exemptions — closed list.** Outside these cases there is no exception:

1. Configuration files, declarative migrations and infrastructure manifests.
2. Tool-generated code (API clients, types, scaffolding).
3. Exploratory spikes explicitly marked as disposable and **not mergeable** to
   `main`.
4. Purely visual adjustments without logic (styles, copy, layout).

Any other omission of tests is a constitution violation and is either documented
in the `plan.md` Complexity Tracking section or blocks the merge.

**Non-negotiable critical coverage.** Regardless of discipline, these paths
require complete and blocking coverage in CI: authentication and sessions,
**tenant isolation**, entitlement verification, fee and billable-hour
calculation, and CFDI generation.

**Consciously accepted risk:** strict TDD in a team without prior practice
reduces velocity by 15% to 30% during the first weeks. The Fase 1 commercial
proposal (13 weeks) has already been issued. If that cost was not priced in, it
is absorbed by CC's margin, not the client's. This decision is revisited if
measured velocity at the close of Sprint 2 indicates the committed timeline is
unreachable — that revision is a formal amendment to this document, not a tacit
relaxation.

### Definition of Done

Inherited from the _LegalConnect Development Handbook_, plus these mandatory
additions:

- Cross-tenant isolation test present and green.
- Audit event verified by test for every mutation.
- The spec's permission matrix implemented and tested.
- Entitlement verification implemented where the feature is tier-restricted.
- Secret scanning and dependency scanning green.

### Merge Rules

- Green CI mandatory. **Never merge on red.**
- Minimum one approved peer code review (per Handbook).
- **English** for code, branches, commits, user stories, specs, plans and this
  constitution. **Spanish** for UI and client-facing documentation. No mixing
  within a layer.

---

## Recognised Technical Debt

Explicit record of decisions taken in full knowledge of their cost. This is not a
to-do list: it is the commitment not to pretend these gaps do not exist.

1. **Authentication is not phishing-resistant.** The primary factor (TOTP) is
   vulnerable to real-time phishing relay. Challenge frequency does not mitigate
   that vector. **Claiming phishing resistance in commercial, sales or compliance
   material is prohibited.**
   _Review trigger:_ close of Discovery, or the first corporate client that
   requires it in a security due diligence review.

2. **EP13 (Client Portal) is unvalidated.** It is treated as a core MVP epic but
   did not appear in the client-stated priorities during the April 2026
   requirements session. Its authentication cost (IdP MAU, external user
   onboarding, MFA reset support) falls on CC's iguala margin. Requires
   re-validation in Fase 0 before committing specs.

3. **External user onboarding does not exist.** EP13 has no user stories for
   invitation, enrollment or first access of a client to the portal. With
   universal mandatory MFA, that flow is a necessary condition for the epic to
   function at all.

4. **EP09 (Billing) has no CFDI stories.** Twelve user stories cover invoice CRUD
   and none covers PAC stamping, cancellation with SAT acknowledgement, payment
   complement or multi-issuer CSD handling. The heaviest technical work in the
   epic is unspecified and unestimated. Must be resolved in Discovery.

5. **Ownership overlap between EP00, EP10 and EP12.** US01–US03-EP10-CFG
   (manage users, manage roles, configure permissions) duplicate
   US11–US13-EP00-FND and US01-EP12-ASC. Ownership must be split before
   `/specify`: EP00 owns the mechanism, EP10 owns the administrative UI.

6. **US02-EP11-PMG (configure email) conflicts with IdP semantics.** If email is
   the identity identifier, changing it is an identity operation requiring
   step-up MFA and re-verification, not a profile edit. Currently classified as
   trivial MVP work; it is not.

7. **Offline operation is unspecified and unestimated.** The April 2026 session
   states the app must work offline. Offline-first combined with multi-tenancy
   and an append-only audit log requires a client-side sync engine and conflict
   resolution, and it makes the audit story genuinely hard (when did the mutation
   occur, when did it sync, which one wins). If it survives Discovery, the
   current quote is not deliverable.

8. **Unresolved: can a user belong to more than one tenant?** A corporate client
   may retain two firms that both use LegalConnect MX; external counsel may
   collaborate with several. If yes, the identity model changes at its root
   (`Identity` + `Membership`, RLS over membership, tenant selector at login).
   This is not a later adjustment. Must be closed before the first `/plan`.

---

## Governance

This constitution takes precedence over any other practice, verbal agreement or
schedule pressure in the project.

- **Amendments** require: a PR with written justification, approval by a CC
  technical lead, and a semantic version bump.
- A `plan.md` that violates a principle must document the violation in its
  **Complexity Tracking** section and justify it explicitly. Undocumented
  violations block the merge.
- Principles marked **NON-NEGOTIABLE** (I, II) admit no exception for schedule,
  budget or client request. A violation can only be resolved by amending the
  constitution, never by ignoring it in a PR.
- Every `[PENDING]` in this document must be closed before the end of Fase 0.
  Entering Fase 1 with open pendings is a governance violation.
- Relaxing a principle de facto — without an amendment — invalidates the
  authority of the entire document. If a principle cannot be met, it is amended
  or removed; it is not ignored.

---

**Version:** 1.3.0 | **Ratified:** 2026-08-14 | **Last Amended:** 2026-08-19

### Amendment History

- **1.3.0** — Added the null-safe RLS predicate rule (`NULLIF` around
  `current_setting`) to Technology Constraints, and required the
  tenant-isolation test suite to assert the no-context case explicitly. Root
  cause: reproduced against a live PostgreSQL 16 instance during validation of
  the `001-tenant-foundation` plan, where the naive predicate raised an error
  under connection pooling instead of failing closed. Placed in the constitution
  rather than in a single slice's `data-model.md` because it governs every RLS
  policy in every present and future slice, not one feature.
- **1.2.0** — Translated to English; language rule extended to cover specs, plans
  and this document. Principle I now references `master-user-story-catalog.md`
  as the authoritative backlog index. Technical Debt reconciled: items on the
  EP12 rewrite and the epic catalog inconsistency are closed; four new items
  recorded (EP09 CFDI gap, EP00/EP10/EP12 ownership overlap, US02-EP11 IdP
  conflict, multi-tenant identity question). User story references updated to the
  `<ModuleCode>` convention.
- **1.1.0** — Added the _Technology Constraints_ section (stack, RLS, Drizzle,
  NestJS, MVP prohibitions, PAC constraints, walking skeleton). AWS fixed as
  provider; region left pending.
- **1.0.0** — Initial ratification.
