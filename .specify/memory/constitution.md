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
`master-user-story-catalog.md` (171 user stories across EP00–EP16). It supersedes
`1. Epics.md`. Any user story not present in that catalog does not exist for the
purposes of this principle. When a slice's design surfaces a capability the catalog
does not describe, the catalog is amended in the same PR as that slice's spec —
this has now happened twice (EP00's creation, and EP12's US18–US19), and it is the
expected outcome of specifying carefully rather than a defect in the process.

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

**Consequence for identity:** tenancy is owned by this product's own PostgreSQL
schema, never by the identity provider. The IdP authenticates a person; it holds no
notion of which firm's data that person may reach. See Authentication below.

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
archetype declares its permission matrix: what it may read, write, delete and
export.

**Verifiable:** a `spec.md` without a permission matrix does not pass the
Discovery approval gate.

**Archetype codes.** Fixed here so they are unambiguous across specs:

| Code | Archetype | Class |
|---|---|---|
| PO | CC Platform Operator (Cosmic Chimps staff) | Vendor — not a tenant membership |
| MP | Managing Partner | Internal |
| AA | Associate Attorney | Internal |
| PL | Paralegal | Internal |
| CM | Case Manager | Internal |
| BM | Billing Manager | Internal |
| SA | System Administrator | Internal, per tenant |
| CC | Corporate Client | Portal |
| IC | Individual Client | Portal |
| CB | Corporate Billing Contact | Portal |
| EL | External Legal Representative | Portal |

PO replaces the earlier overloaded use of CC for the vendor role; CC now
denotes only the Corporate Client portal archetype. "CC" in prose continues to mean
Cosmic Chimps the company.

**Note:** the global role matrix is still undefined (April requirements session:
"to be defined once all user types accessing the system are identified"). This
principle builds it incrementally per story rather than blocking development
until it is complete. Slice 004-authorization-entitlements owns its completion.

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

**Identity provider: Amazon Cognito user pools, Essentials tier.** Decided
2026-08-21, closing the `[PENDING]` this section carried since v1.1.0. One shared
user pool for the whole platform; a single app client. LegalConnect MX stores no
passwords.

**Why this provider, stated plainly so the decision can be re-litigated on
evidence rather than taste:**

1. **It is the only candidate with data residency in Mexico.** Cognito has been
   available in mx-central-1 with all three tiers since 2025-07-29. Every
   alternative evaluated — Auth0, Logto, WorkOS, Clerk, Descope, Zitadel, Stytch,
   Entra External ID, Google Identity Platform — hosts identity data in the United
   States or Europe. For a product whose subject matter is covered by
   attorney-client privilege and sold to Mexican firms, keeping identity data in
   the same jurisdiction as the case files is both a compliance simplification and
   a sales argument. See Data Residency.
2. **It adds no vendor.** The stack is already AWS. No additional contract, no
   additional data processor in the privacy notice, no additional external
   dependency in front of the door to privileged material, and no additional
   pass-through line in the iguala.
3. **Cost.** Cognito Essentials includes 10,000 MAU per month at no charge, and
   that allowance does not expire with the AWS free tier; beyond it, $0.015/MAU.
   At the projected scale — roughly 110 users per tenant with EP13 active, 10:1
   external to internal — twenty firms is about 2,200 MAU, inside the free
   allowance. The nearest functional equivalent, Logto, is $120/month from the
   first tenant. That difference lands directly on iguala margin, which is CC's,
   not the client's.
4. **It satisfies the three hard requirements below** — mandatory MFA that no
   tenant administrator can relax, native WebAuthn, and sign-out that propagates
   to the provider — without a tier jump.

**What this choice costs, and it is not nothing.** Cognito has no organizations
primitive and no backup codes. The first is irrelevant: tenancy and the archetype
matrix live in this product's PostgreSQL with Row-Level Security (Principle II),
and were built that way in slice 001-tenant-foundation before this decision. The
second is a real gap against a hard requirement of this document and is addressed
by the named exception below.

**Requirements this provider satisfies, and which any replacement must also
satisfy:**

- **MFA enrollment is MANDATORY** for every user of the system, internal and
  external. No exceptions, and no ability to relax it per tenant. Cognito enforces
  this at the user pool, and Cognito has no notion of a tenant administrator, so
  there is nobody below the platform who could relax it.
- **MFA challenge on EVERY sign-in**, for every role. There is no trusted-device
  mechanism and no suppression of the second factor. Cognito device tracking MUST
  be configured to **"Don't remember"**; the "Always remember" setting substitutes
  a device credential for the MFA challenge and is therefore prohibited.
  Rationale: every access reaches material covered by attorney-client
  privilege; this product recognises no low-risk role.
- **Native WebAuthn/passkey support**, even though passkeys are not enabled in
  v1.0. Choosing a provider without it would turn future adoption into a provider
  migration rather than a configuration change. Cognito supports passkeys from the
  Essentials tier. **Regional availability of this specific capability in
  mx-central-1 is not positively confirmed in AWS documentation — see Recognised
  Technical Debt item 11.**
- **Sign-out and revocation propagate to the provider.** Cognito GlobalSignOut
  and RevokeToken provide this. Note that a revoked Cognito token still passes
  naive signature-and-expiry validation, so the API must consult revocation state
  rather than trusting the token — which this product does anyway, because
  sessions are its own (see Sessions).

**Permitted factors (v1.0):**

- **TOTP** (authenticator app) — the sole enrolled factor for every role in v1.0.
- **Backup codes** — mandatory, issued at enrollment. Built by this product; see
  the named exception below.
- **SMS is PROHIBITED**, as a primary factor and as a fallback. Rationale
  unchanged (SIM swap; per-message cost on every session given the permanent
  challenge), now reinforced by the fact that no factor in v1.0 requires it.
- **Email OTP is DEFERRED, not permitted, in v1.0.** Earlier revisions of this
  document allowed it for low-frequency external portal users. Three findings
  retire that allowance for now: EP13, the only epic with such users, remains
  unvalidated (Technical Debt item 2); Cognito cannot serve email MFA and
  email-based account recovery from the same user pool, which would break
  self-service recovery for precisely the users who have no other channel; and
  Amazon SES is not available in mx-central-1. Reinstating email OTP requires an
  amendment, and the earliest sensible trigger is EP13's validation.

**Named exception — custody of backup code material.** This document states that
the platform stores no passwords, and that remains true. It does not store
authentication factors either, with exactly one exception, granted here because
the chosen provider does not offer the capability and this document requires it:

- The platform MAY store backup codes for the sole purpose of recovering a lost
  second factor.
- Codes MUST be stored only as hashes produced by a memory-hard function
  (Argon2id or scrypt), never in recoverable form, never in logs, never in error
  messages, and never in an audit entry.
- Each code is single-use. Consuming one invalidates it. Re-issuance replaces the
  entire set rather than topping it up.
- Issuance, consumption, exhaustion and re-issuance are each audited, identifying
  the acting identity by reference.
- Coverage of this path is non-negotiable and blocking in CI, on the same footing
  as tenant isolation.
- No archetype may read another person's codes, and no archetype may read any
  code at all — including PO and SA.

Slice 003-authentication-mfa owns this construction. It is the price of the
provider decision and is recorded as Recognised Technical Debt item 9 so it is not
mistaken for a free capability.

**Step-up MFA is mandatory**, regardless of session age, for: creating or
deactivating users, changes to the permission matrix, uploading or replacing
PAC/CSD credentials, full case export, and resetting another user's MFA. Slice
005-session-lifecycle owns the mechanism; capabilities that require it MUST NOT
be exposed in production before it exists.

**Access recovery:** every factor reset is recorded in the audit log identifying
the authorising party. No internal role may reset an external user's factor without
documented out-of-band verification.
Rationale: with universal mandatory MFA, the recovery flow becomes the weakest
attack surface in the system. A phone call cannot be allowed to unlock access to a
case file.

**Compensating mitigations, mandatory while the primary factor is phishable:**
DMARC/SPF/DKIM enforced on the domain; requesting OTPs via email links is
prohibited; a single access domain is communicated to users.

### Sessions

Sessions belong to this product, not to the identity provider. The provider
authenticates; this product decides how long the resulting access lives and
revokes it.

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
  Revocation must also propagate to the provider.
- Explicit sign-out invalidates the token immediately, server-side and at the
  provider.

**Consequence of owning sessions:** Cognito has no API to list a user's active
sessions, and that does not matter — the session inventory those two stories
require is this product's own table. The provider is not asked for a capability it
does not have.

### Data Residency

Provider: **AWS**. Region: **mx-central-1 — AWS Mexico (Central)**. Decided
2026-08-21, closing the `[PENDING]` this section carried since v1.1.0.

Verified available in that region: Cognito user pools (all three tiers), ECS with
Fargate, RDS for PostgreSQL (through major version 18), S3, KMS with FIPS
endpoints, SQS, Secrets Manager. The region has **three Availability Zones** and
supports Multi-AZ RDS.

**One documented exception, and it must appear in the privacy notice.** Amazon SES
is **not available** in mx-central-1. Transactional email — invitation delivery
above all — therefore leaves the region, either through SES in another AWS region
or through a third-party provider. Consequences to hold:

- Case files, documents, notes, time entries, invoices, the audit log and identity
  records remain in Mexico. Nothing about that changes.
- What crosses the border is the transactional message itself: a recipient email
  address and the message body. Invitation emails MUST therefore carry no case
  data, no client name and no matter reference — only a firm name and an opaque
  invitation reference.
- The transfer must be declared in the privacy notice in accordance with LFPDPPP,
  scoped to transactional email rather than stated as a general transfer.
- The choice between cross-region SES and a third-party provider is a `plan.md`
  decision for slice 002-identity-membership, not a constitutional one. Either
  way the provider is a data processor and must be named.

Constraints that continue to apply:

- The region appears in the firm's privacy notice.
- The contractual operator of the infrastructure is documented along with its legal
  capacity (data processor), given that cloud is billed as a pass-through to the
  firm.
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
Cloud:      AWS mx-central-1 — ECS Fargate + RDS PostgreSQL + S3 + KMS + SQS
DB:         PostgreSQL with enforced Row-Level Security
             (shared schema, tenant_id on every table)
Backend:    NestJS (TypeScript) + Drizzle ORM
Frontend:   Next.js (React), responsive web
Auth:       Amazon Cognito user pools, Essentials tier — one pool, one app client
Email:      Transactional provider outside mx-central-1 — [decided in slice 002 plan]
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

### Amazon Cognito — derived from Principle II and the Authentication section

- **One user pool for the entire platform, one app client.** Pool-per-tenant and
  app-client-per-tenant are both **prohibited**. Reasons: the 1,000 user pools per
  region quota does not scale operationally, a global policy change would become
  one API call per tenant, and — decisively — a person may hold membership in more
  than one tenant (`001/FR-021`), which a pool-per-tenant model cannot represent
  without duplicating the human being.
- **Cognito holds no tenancy and no authorization.** It answers one question: is
  this person who they claim to be. Which firm they may reach, and with what
  archetype, is answered by this product's membership table under RLS. No token
  claim is ever trusted as a source of tenant or archetype
  (`002/FR-016`).
- Device tracking MUST be **"Don't remember"** (see Authentication).
- Because a revoked Cognito token still passes naive signature-and-expiry
  validation, the API MUST validate against this product's own session state, never
  against the token alone.

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
| Tenant scope (P. II)              | Global interceptor                     |
| Permissions per archetype (P. IV) | Global interceptor                     |
| Tier entitlement                  | Global guard                           |
| Audit event (P. V)                | Global interceptor over every mutation |

An endpoint that requires applying any of these manually is a design violation:
the mechanism must apply by default, and omitting it must be an explicit,
reviewable act rather than a possible oversight.

**Correction (v1.4.0):** the first two rows said "middleware" and "guard". Slice
001 established that both must run as **interceptors**: NestJS Guards execute
before Interceptors, and the resolved principal an archetype check needs is only
available after the tenant-context interceptor has run. A Guard-based permission
check therefore cannot see what it must evaluate. Entitlement checking remains a
Guard because it depends on the tenant's plan rather than on the principal.

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
- ❌ A second identity provider, or federation to a firm's own IdP. Enterprise SSO
  is a Fase 2 conversation, not an MVP capability.

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
- **`[PENDING]` — PAC selection.** This is now the only open pending in this
  document. It does not block slices 002–010; it blocks slice 011-cfdi-stamping,
  which additionally has no user stories in the catalog yet (Technical Debt item 4).

### Walking Skeleton — entry condition to Fase 1

Before day one of Fase 1, a trivial endpoint must exist that traverses the entire
architecture with the non-negotiables already installed:

1. Login against the IdP with MFA end-to-end. — slice 003
2. Tenant interceptor + `SET LOCAL app.tenant_id` + one table with active RLS. — ✅ slice 001
3. Audit interceptor writing to the append-only table. — ✅ slice 001
4. Permission guard and entitlement guard operational. — partial in 001 (SA only, no entitlement check); completed in slice 004
5. Cross-tenant leak test green. — ✅ slice 001 on fixtures; against real data in slice 002
6. Complete CI pipeline: secret scanning, dependency scanning, blocking coverage,
   RLS verification. — ✅ slice 001

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
**tenant isolation**, entitlement verification, **backup code issuance and
consumption**, fee and billable-hour calculation, and CFDI generation.

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
  within a layer. Team coordination documents (slice roadmap, work allocation) are
  exempt and may be written in Spanish; they are not SpecKit artifacts.
- One slice per directory under `specs/`. A PR is scoped to a single slice
  directory plus, at most, its own row of the catalog index. The slice roadmap
  (`speckit/slice-roadmap.md`) records the queue and the merge protocol for the
  files two people genuinely contend over.

---

## Recognised Technical Debt

Explicit record of decisions taken in full knowledge of their cost. This is not a
to-do list: it is the commitment not to pretend these gaps do not exist.

1. **Authentication is not phishing-resistant.** The primary factor (TOTP) is
   vulnerable to real-time phishing relay. Challenge frequency does not mitigate
   that vector. **Claiming phishing resistance in commercial, sales or compliance
   material is prohibited.**
   _Review trigger:_ close of Discovery, or the first corporate client that
   requires it in a security due diligence review. Enabling Cognito passkeys is
   the remedy and is a configuration change, not a migration — which is why native
   WebAuthn support was a disqualifying requirement in provider selection.

2. **EP13 (Client Portal) is unvalidated.** It is treated as a core MVP epic but
   did not appear in the client-stated priorities during the April 2026
   requirements session. Its authentication cost (MAU, external user onboarding,
   MFA reset support) falls on CC's iguala margin. Requires re-validation in
   Fase 0 before committing specs. Note that the Cognito free allowance of 10,000
   MAU absorbs the projected external population for the first tens of firms, so
   the MAU argument is now much weaker than when this item was written; the
   support-volume argument is not.

3. **External user onboarding does not exist.** EP13 has no user stories for
   invitation, enrollment or first access of a client to the portal. With
   universal mandatory MFA, that flow is a necessary condition for the epic to
   function at all. EP12's US18–US19 now cover the internal equivalent; whether
   the external flow reuses them is an EP13 question and is not settled.

4. **EP09 (Billing) has no CFDI stories.** Twelve user stories cover invoice CRUD
   and none covers PAC stamping, cancellation with SAT acknowledgement, payment
   complement or multi-issuer CSD handling. The heaviest technical work in the
   epic is unspecified and unestimated. Must be resolved in Discovery, and it
   gates slice 011 together with the PAC pending.

5. **Ownership overlap between EP00, EP10 and EP12.** US01–US03-EP10-CFG
   (manage users, manage roles, configure permissions) duplicate
   US11–US13-EP00-FND and US01-EP12-ASC. Ownership is now split by slice: EP00's
   mechanism is slice 004, EP12's invitation flow is slice 002, and EP10's
   administrative UI is slice 014. Any residual ambiguity is resolved in favour of
   the mechanism owning behaviour and the UI owning presentation.

6. **US02-EP11-PMG (configure email) conflicts with IdP semantics.** If email is
   the identity identifier, changing it is an identity operation requiring
   step-up MFA and re-verification, not a profile edit. Currently classified as
   trivial MVP work; it is not. `002/FR-003` already forbids the silent-merge
   behaviour that would make this dangerous, but the user-facing flow remains
   unspecified.

7. **Offline operation is unspecified and unestimated.** The April 2026 session
   states the app must work offline. Offline-first combined with multi-tenancy
   and an append-only audit log requires a client-side sync engine and conflict
   resolution, and it makes the audit story genuinely hard (when did the mutation
   occur, when did it sync, which one wins). If it survives Discovery, the
   current quote is not deliverable.

8. **Backup codes are built by this product, not bought.** Cognito provides none,
   and this document requires them. The consequence is that LegalConnect MX
   custodies authentication material it would otherwise have avoided entirely —
   see the named exception under Authentication. This is the single largest
   concession made in exchange for data residency in Mexico and a zero-cost
   provider, and it is a real one: a bug in that path is an authentication bypass.
   Coverage is blocking. Owned by slice 003.
   _Review trigger:_ if a future provider offers backup codes with residency in
   Mexico, this exception should be withdrawn rather than kept for convenience.

9. **Transactional email leaves mx-central-1.** SES is not available in the
   region. Invitation and notification email therefore transits another
   jurisdiction, carrying a recipient address and a message body. Mitigated by
   forbidding case data in those messages and by declaring the transfer in the
   privacy notice, but not eliminated. A firm in a security due diligence review
   will ask about it, and the honest answer is that identity and case data stay in
   Mexico while transactional email does not.

10. **Cognito passkey availability in mx-central-1 is not positively
    confirmed.** AWS documents no regional exclusion for the capability, and the
    launch announcement lists all three tiers, but no AWS source states feature
    parity explicitly. Since native WebAuthn was a disqualifying requirement in
    provider selection, this must be verified with AWS or by direct test **before
    slice 003's plan is approved**, not at the moment passkeys are first needed.
    If it turns out to be unavailable in the region, the choice is between the
    region and the provider, and this constitution is amended either way.

11. **The 004 archetype matrix does not exist yet.** Today only SA is ever
    granted anything, and no entitlement check exists at all — `plan.entitlements`
    is written and read by nothing. Until slice 004 lands, every capability that
    depends on a real archetype decision is either unavailable or gated to SA.

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
  Entering Fase 1 with open pendings is a governance violation. **One remains:
  PAC selection.**
- Relaxing a principle de facto — without an amendment — invalidates the
  authority of the entire document. If a principle cannot be met, it is amended
  or removed; it is not ignored.

---

**Version:** 1.4.0 | **Ratified:** 2026-08-14 | **Last Amended:** 2026-08-21

### Amendment History

- **1.4.0** — Closed two of the three `[PENDING]` items. **Identity provider:
  Amazon Cognito user pools, Essentials tier**, one shared pool and one app
  client, chosen for data residency in Mexico, absence of an additional vendor,
  cost inside the free MAU allowance at projected scale, and satisfaction of the
  three hard requirements (irrelaxable MFA, native WebAuthn, revocation that
  propagates). **Region: mx-central-1**, with SES's absence there recorded as a
  documented exception affecting transactional email only. Added a **named
  exception permitting custody of hashed backup code material**, because Cognito
  provides none and this document requires them; blocking coverage extended to
  that path. **Email OTP retired from v1.0** and made amendment-gated, for three
  independent reasons. Added the archetype code table, introducing PO for the
  vendor role so CC unambiguously means Corporate Client. Corrected the
  cross-cutting mechanism table: tenant scope and permission checks are
  **interceptors**, not middleware and guards — Guards run before Interceptors and
  cannot see the resolved principal. Struck the closed multi-tenant identity debt
  item (closed by 001/D1), renumbered the remainder, and added four new items
  (backup code custody, transactional email egress, unconfirmed passkey regional
  availability, absent archetype matrix). Walking skeleton items annotated with
  their owning slice and current state. Traceability baseline updated to 171
  stories; a second identity provider and federated SSO added to the MVP
  prohibitions.
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
