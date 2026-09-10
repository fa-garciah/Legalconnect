<!--
SYNC IMPACT REPORT — 2026-09-04
================================
Version change: 1.4.1 → 1.5.0  (MINOR)

Bump rationale: materially expanded guidance plus new sections. No Core Principle
(I–VI) is removed, renamed or redefined — the identity provider is a Security
Constraint and a Technology Constraint, not a principle. Principle II is
*reinforced*: identity now lives under the same RLS as everything else. The
amendment request named the base as v1.4.0; the document was actually at v1.4.1
(the NestJS entitlement-interceptor correction), so this amendment is 1.4.1 →
1.5.0. No content of 1.4.1 is lost.

Modified sections (no titles renamed):
  - Security Constraints › Authentication — provider decision replaced; Cognito
    retained as "Superseded 2026-09-04"; mandatory MFA restated as a code
    obligation with no disable path; backup code custody reformulated from
    "named exception" to positive design obligation, requirements intact.
  - Security Constraints › Sessions — Cognito GlobalSignOut/RevokeToken and the
    "no API to list sessions" note removed. Product-owned sessions unchanged.
  - Security Constraints › Data Residency — Cognito user pools removed from the
    verified-services list; mx-central-1 infrastructure decision explicitly
    unchanged.
  - Technology Constraints › Stack — `Auth:` line rewritten.
  - Development Workflow › Testing discipline — blocking coverage list extended
    with MFA enforcement and TOTP secret encryption/decryption/verification.
  - Recognised Technical Debt — items 1, 2, 8 amended.
  - Governance — pending count 1 → 2.

Added sections:
  - Security Constraints › Authentication › "Custody of TOTP secrets".
  - Technology Constraints › "Self-hosted identity — derived from Principle II
    and the Authentication section" (replaces the "Amazon Cognito" section).
  - Recognised Technical Debt item 10 — WebAuthn/passkeys are a build.
  - Recognised Technical Debt item 11 — TOTP secret custody.
  - "Consequences of the v1.5.0 Amendment" table.
  - Data Residency › new [PENDING] on the scope of the AWS account blockage.

Removed sections:
  - Technology Constraints › "Amazon Cognito" (replaced, not deleted outright —
    the decision itself is preserved as Superseded under Authentication).
  - Recognised Technical Debt, prior item 10 (unconfirmed Cognito passkey
    availability in mx-central-1) — struck as moot with the provider retired.

Follow-up TODOs / deferred items:
  - [PENDING] Scope of the AWS account blockage (Data Residency). Recorded rather
    than assumed, per the amendment request's own instruction. Owner: whoever
    holds the AWS account relationship at CC.
  - [PENDING] PAC selection — pre-existing, untouched.
  - specs/002-identity-membership/spec.md still names Cognito in Dependencies and
    Out-of-Scope. Deliberately NOT corrected here: a PR is scoped to one slice
    directory (Merge Rules). See the Consequences table.
  - No RATIFICATION_DATE change: 2026-08-14 preserved.
-->

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

**Identity provider: self-hosted — NextAuth (Auth.js) with the Credentials
provider, plus `otplib` for TOTP, running against this product's own PostgreSQL.**
Decided 2026-09-04, superseding the Cognito decision recorded below. LegalConnect
MX stores no passwords in recoverable form; credential verification material is
held only as a memory-hard hash, under the same rules this section imposes on
backup codes.

**Why this provider, stated plainly so the decision can be re-litigated on
evidence rather than taste:**

1. **It does not depend on an AWS account this project does not control today.**
   Provisioning a Cognito user pool and confirming passkey support in
   mx-central-1 both require account access that has been blocked with no
   committed date. That blockage stopped slice `003-authentication-mfa`, and
   through it `005-session-lifecycle`, `016a`'s real login, and every capability
   that presupposes an authenticated principal. A dependency that cannot be
   exercised is not a dependency; it is a halt. This decision removes it.
2. **Identity and session data stay entirely in this product's own PostgreSQL,
   under the same Row-Level Security as every other table, with no external
   vendor in front of the door to privileged material.** This *strengthens* the
   data-residency argument rather than weakening it. Previously identity records
   sat with a processor that had to be named in the privacy notice and defended in
   a due diligence review; now they sit in the same database, the same region and
   the same backup jurisdiction as the case files they unlock. No additional
   contract, no additional data processor, no additional pass-through line in the
   iguala.
3. **Cost per monthly active user is zero, at every scale.** The prior decision
   was cost-justified by a 10,000 MAU free allowance and $0.015/MAU beyond it. A
   self-hosted verifier has no per-user price at all, so EP13's projected external
   population — roughly 110 users per tenant, 10:1 external to internal — adds no
   identity cost as the tenant count grows, and the argument does not weaken at
   the scale where the free allowance would have run out.

**What this choice costs, and it is not nothing.** Three capabilities that were
bought are now built:

- **WebAuthn/passkeys stop being a configuration change and become a
  construction.** This was a disqualifying requirement in the original selection
  and the single strongest argument for the prior provider. Recorded as Recognised
  Technical Debt item 10.
- **TOTP secret custody becomes this product's responsibility**, and unlike a
  backup code a TOTP secret cannot be hashed. Recorded as Recognised Technical
  Debt item 11 and governed by the custody rules below.
- **Mandatory MFA loses its structural guarantee.** A user pool enforced it in a
  place no tenant administrator could reach. The application now enforces it, and
  the rules below say so explicitly rather than leaving it to be inferred from a
  vendor's behaviour.

**Superseded 2026-09-04 — Amazon Cognito user pools, Essentials tier.** Decided
2026-08-21 and recorded here rather than deleted, following this document's
practice for closed decisions, so the reasoning stays available if the
circumstance that retired it changes. One shared user pool for the whole platform
and a single app client, chosen for data residency in mx-central-1 (available
there with all three tiers since 2025-07-29, unlike Auth0, Logto, WorkOS, Clerk,
Descope, Zitadel, Stytch, Entra External ID and Google Identity Platform, all of
which host identity data in the United States or Europe), for adding no vendor to
an already-AWS stack, for a free MAU allowance that absorbed the projected scale,
and for satisfying irrelaxable MFA, native WebAuthn and provider-propagated
revocation without a tier jump. **Retired because the AWS account access required
to provision the pool and to confirm passkey availability in mx-central-1 is
blocked with no committed date, and slice 003 — with 005, 016a and every
authenticated capability behind it — can no longer be held for it.** The residency
argument that motivated the original choice is not lost by retiring it; it is
served more directly by keeping identity in this product's own database.
Reversing this decision if account access is restored is an amendment, not a
default: it would reintroduce a processor and a per-MAU cost to recover a passkey
configuration and an MFA guarantee that the rules below now place in code.

**Requirements this provider satisfies, and which any replacement must also
satisfy:**

- **MFA enrollment is MANDATORY** for every user of the system, internal and
  external. No exceptions, and no ability to relax it per tenant. **The
  application enforces this in code.** The prior provider guaranteed it
  structurally, at a user pool no tenant administrator could reach; that backing
  is gone, so the guarantee is stated as a requirement on this codebase rather
  than inherited from a vendor:
  - There is **no configuration flag, environment variable, plan entitlement,
    per-tenant setting or feature flag that disables MFA enrollment or the MFA
    challenge.** A mechanism whose only purpose is to switch this off must not
    exist to be misused, misconfigured or wrongly defaulted. Introducing one is a
    constitution violation, not a configurable trade-off.
  - An identity without a verified second factor reaches **no** authenticated
    capability. The unenrolled state resolves to enrollment or to refusal, never
    to access.
  - **Coverage of the MFA enforcement path is complete and blocking in CI, on the
    same footing as tenant isolation** (Principle II). Not "authentication is
    covered" in aggregate: the assertions that an unenrolled identity is refused,
    that a challenge is issued on every sign-in, and that no configuration value
    alters either, are individually required and individually blocking. This is
    the same bar Principle II holds, for the same reason — each is a single
    misconfiguration that leaves every test green and the protection absent.
- **MFA challenge on EVERY sign-in**, for every role. There is no trusted-device
  mechanism and no suppression of the second factor. No device-remembering
  capability may be built: substituting a device credential for the MFA challenge
  is prohibited, whether a provider offers it or this product would implement it.
  Rationale: every access reaches material covered by attorney-client
  privilege; this product recognises no low-risk role.
- **A path to WebAuthn/passkeys that does not require replacing the identity
  layer**, even though passkeys are not enabled in v1.0. The prior provider
  satisfied this natively; it is now a build, and the build must land inside this
  identity layer rather than by migrating off it. See Recognised Technical Debt
  item 10.
- **Sign-out and revocation are immediate and authoritative.** Sessions are this
  product's own (see Sessions), so revocation is a write to its own table and
  takes effect on the next request. There is no external provider holding a
  parallel notion of validity, which removes a class of divergence the prior
  decision had to work around.

**Permitted factors (v1.0):**

- **TOTP** (authenticator app) — the sole enrolled factor for every role in v1.0.
  Implemented with `otplib`; secret custody is governed below.
- **Backup codes** — mandatory, issued at enrollment. Built and custodied by this
  product by design; see below.
- **SMS is PROHIBITED**, as a primary factor and as a fallback. Rationale
  unchanged (SIM swap; per-message cost on every session given the permanent
  challenge), now reinforced by the fact that no factor in v1.0 requires it.
- **Email OTP is DEFERRED, not permitted, in v1.0.** Earlier revisions of this
  document allowed it for low-frequency external portal users. The deferral rests
  on two findings this amendment does not disturb: EP13, the only epic with such
  users, remains unvalidated (Technical Debt item 2); and Amazon SES is not
  available in mx-central-1. A third finding — that the prior provider could not
  serve email MFA and email-based account recovery from one user pool — was
  provider-specific and is **superseded 2026-09-04** with that provider. It is
  marked superseded rather than deleted so the deferral is not later read as
  resting on a reason that no longer exists. Reinstating email OTP requires an
  amendment, and the earliest sensible trigger is EP13's validation.

**Custody of backup code material — by design, not by exception.** Earlier
revisions granted this as a *named exception* to the rule that the platform stores
no authentication factors, on the grounds that the chosen provider offered no
backup codes. There is no longer an external MFA provider for this to be an
exception to: with a self-hosted identity layer, building and holding this
material **is** the design. It is therefore stated as a positive obligation,
carrying every requirement it always carried, unweakened:

- The platform stores backup codes for the sole purpose of recovering a lost
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

**Custody of TOTP secrets.** A TOTP secret differs from a backup code in the one
respect that governs how it must be held: it MUST be readable on every
verification, so **it cannot be hashed.** That makes it the most sensitive
recoverable material in the database, and it is governed separately rather than
folded into the rules above:

- The secret is **encrypted at rest under an application-held key that is separate
  from the database** — envelope encryption or KMS. A database dump, a restored
  backup, or read access to the table MUST NOT be sufficient to derive a working
  second factor. Storing the secret in plaintext, or encrypted under a key the
  database itself holds, defeats the entire control.
- The secret MUST NEVER appear — in plaintext or ciphertext — in logs, error
  messages, exception payloads, traces, or the audit log. The audit log records
  that enrollment or verification occurred, identifying the identity by reference,
  never the material.
- Access to the encryption key is restricted and audited **to the same standard
  this document sets for PAC/CSD credentials**, including step-up MFA on
  operations that touch it.
- No archetype may read a TOTP secret, including PO and SA. Reset means
  re-enrollment, never disclosure.
- Coverage of the encryption, decryption and verification path is non-negotiable
  and blocking in CI, on the same footing as tenant isolation.

Slice 003-authentication-mfa owns all three constructions — the enforcement path,
backup codes, and TOTP secret custody. They are the price of this provider
decision and are recorded as Recognised Technical Debt items 8, 10 and 11 so they
are not mistaken for free capabilities.

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
- Explicit sign-out invalidates the token immediately, server-side.

**Consequence of owning sessions:** the session inventory those two stories
require is this product's own table, and revocation is a write to it. With a
self-hosted identity layer there is no second system holding a parallel notion of
session validity, so no external revocation state can disagree with this
product's own — the divergence the prior provider decision had to guard against
does not arise.

### Data Residency

Provider: **AWS**. Region: **mx-central-1 — AWS Mexico (Central)**. Decided
2026-08-21, closing the `[PENDING]` this section carried since v1.1.0.

Verified available in that region: ECS with Fargate, RDS for PostgreSQL (through
major version 18), S3, KMS with FIPS endpoints, SQS, Secrets Manager. The region
has **three Availability Zones** and supports Multi-AZ RDS.

**The region decision is unchanged by the 2026-09-04 identity amendment.** That
amendment retires the identity provider and nothing else: ECS, RDS, S3, KMS, SQS
and Secrets Manager in mx-central-1 remain the infrastructure decision, and
identity data now sits in this region more firmly than before, since it lives in
RDS rather than at a provider. Cognito user pools were previously listed among the
services verified here; that line is removed with the provider, not because
regional availability changed.

**[PENDING] — the scope of the AWS account blockage is not confirmed.** The
identity amendment was written against a blockage described as preventing user
pool provisioning and passkey verification, and this section assumes it is scoped
to Cognito. If the blockage is in fact **account-wide**, then the paragraph above
names a region this project also cannot provision today, and the item in question
is the deployment target rather than the identity provider — a materially
different problem with a different remedy. This is recorded as a pending rather
than assumed in either direction, because only whoever holds the AWS relationship
can distinguish the two cases. **Owner:** whoever holds the AWS account
relationship at CC. **Resolution:** confirm in writing whether the blockage is
scoped to Cognito provisioning or covers the account. If account-wide, this
section is amended and the Walking Skeleton's deployment assumption is reopened;
the identity decision above stands either way, since it is the case that no longer
depends on the account.

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
Auth:       Self-hosted — NextAuth (Auth.js) Credentials provider + otplib TOTP;
             identity and sessions in this product's own PostgreSQL
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

### Self-hosted identity — derived from Principle II and the Authentication section

- **One identity namespace for the entire platform.** A per-tenant identity store
  — separate tables, separate schemas or separate credential namespaces keyed by
  tenant — is **prohibited**, for the reason that decided it under the prior
  provider and does not depend on that provider: a person may hold membership in
  more than one tenant (`001/FR-021`), which a per-tenant identity model cannot
  represent without duplicating the human being. `identity` is global; `membership`
  is what binds a person to a firm.
- **The identity layer holds no tenancy and no authorization.** It answers one
  question: is this person who they claim to be. Which firm they may reach, and
  with what archetype, is answered by this product's membership table under RLS.
  No session claim, token claim or NextAuth callback payload is ever trusted as a
  source of tenant or archetype (`002/FR-016`). This separation is what makes the
  identity layer replaceable, and it is the reason this amendment touches no slice
  that has already shipped.
- **The `identity` table and the session table are tenant-global by design and
  therefore carry no `tenant_id` and no RLS policy of their own.** They are the
  documented exception to the RLS catalogue check above, not an oversight in it: a
  person exists before and across tenants. Every table that resolves *from* an
  identity to tenant data — `membership` first among them — is tenant-scoped and
  policied normally. A slice that adds a tenant-scoped column to either of these
  tables is changing this decision and needs an amendment.
- **No device-remembering mechanism may be built** (see Authentication). The prior
  provider had a setting for this that had to be held off; here the requirement is
  that the capability not exist.
- The API MUST validate every request against this product's own session state,
  never against a bearer token's signature and expiry alone.
- **`otplib` and the NextAuth Credentials provider are load-bearing dependencies
  under Principle II's blast radius**, not incidental libraries: a defect or an
  unreviewed upgrade in either is an authentication defect. They are pinned, and
  their upgrades are reviewed as security changes rather than as routine
  dependency bumps.

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
| Tier entitlement                  | Global interceptor                     |
| Audit event (P. V)                | Global interceptor over every mutation |

An endpoint that requires applying any of these manually is a design violation:
the mechanism must apply by default, and omitting it must be an explicit,
reviewable act rather than a possible oversight.

**Correction (v1.4.0):** the first two rows said "middleware" and "guard". Slice
001 established that both must run as **interceptors**: NestJS Guards execute
before Interceptors, and the resolved principal an archetype check needs is only
available after the tenant-context interceptor has run. A Guard-based permission
check therefore cannot see what it must evaluate.

**Correction (v1.4.1):** the third row said "Global guard", carried over
unamended when v1.4.0 corrected the first two. The same defect applies for the
same reason: entitlement depends on the tenant's **plan**, which does not exist
until the tenant-context interceptor has resolved a principal, so a Guard
evaluating it would find no tenant on every request. Slice 004 implemented
`AuthorizationInterceptor` as a fourth global interceptor, nested inside the
tenant and platform context interceptors and outside the audit interceptor,
deciding permission, scope and entitlement together against one `decide()`
function (`backend/src/common/authz/`).

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
- **`[PENDING]` — PAC selection.** It does not block slices 002–010; it blocks
  slice 011-cfdi-stamping, which additionally has no user stories in the catalog
  yet (Technical Debt item 4). This was the only open pending in the document
  until 2026-09-04, when the identity amendment opened a second one — the scope of
  the AWS account blockage, under Data Residency.

### Walking Skeleton — entry condition to Fase 1

Before day one of Fase 1, a trivial endpoint must exist that traverses the entire
architecture with the non-negotiables already installed:

1. Login against the IdP with MFA end-to-end. — slice 003
2. Tenant interceptor + `SET LOCAL app.tenant_id` + one table with active RLS. — ✅ slice 001
3. Audit interceptor writing to the append-only table. — ✅ slice 001
4. Permission guard and entitlement guard operational. — ✅ slice 004 (`AuthorizationInterceptor`; partial in 001, SA only, no entitlement check)
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
**tenant isolation**, **MFA enforcement** (that an unenrolled identity reaches no
authenticated capability, that a challenge is issued on every sign-in, and that no
configuration value alters either), entitlement verification, **backup code
issuance and consumption**, **TOTP secret encryption, decryption and
verification**, fee and billable-hour calculation, and CFDI generation.

The three authentication entries are stated separately, and at the same level as
tenant isolation, because the 2026-09-04 amendment moved them from a vendor's
guarantee into this codebase. "Authentication is covered" in aggregate does not
discharge them: each is a single misconfiguration that leaves every other test
green while the protection is absent, which is precisely the property that put
tenant isolation on this list.

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
   requires it in a security due diligence review. The remedy is still passkeys,
   but **as of 2026-09-04 it is a build rather than a configuration change** —
   see item 10. This item became more expensive to close, not more likely to
   remain open: the same mitigation applies, and it now has to be written.

2. **EP13 (Client Portal) is unvalidated.** It is treated as a core MVP epic but
   did not appear in the client-stated priorities during the April 2026
   requirements session. Its authentication cost (external user onboarding, MFA
   reset support) falls on CC's iguala margin. Requires re-validation in Fase 0
   before committing specs. **The MAU argument is retired as of 2026-09-04:** a
   self-hosted identity layer has no per-user price, so the external population
   carries no identity licence cost at any scale. The support-volume argument is
   untouched and is now the whole of this item — every external user is an MFA
   enrollment and a potential MFA reset, handled by people, and that cost does not
   fall with the provider change.

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

8. **Backup codes are built by this product, not bought.** This document requires
   them and no provider supplies them, so LegalConnect MX custodies authentication
   material — see *Custody of backup code material* under Authentication. A bug in
   that path is an authentication bypass. Coverage is blocking. Owned by slice 003.
   **Reframed 2026-09-04:** this was recorded as a concession extracted by the
   Cognito decision, remediable by a future provider that offered backup codes
   with Mexican residency. With a self-hosted identity layer there is no such
   provider to wait for, so this is no longer a gap against a bought capability
   awaiting a better vendor — it is a permanent property of the design, and the
   review trigger is withdrawn as vacuous. What remains is the obligation: build
   it correctly, cover it blockingly, and never treat it as routine.

9. **Transactional email leaves mx-central-1.** SES is not available in the
   region. Invitation and notification email therefore transits another
   jurisdiction, carrying a recipient address and a message body. Mitigated by
   forbidding case data in those messages and by declaring the transfer in the
   privacy notice, but not eliminated. A firm in a security due diligence review
   will ask about it, and the honest answer is that identity and case data stay in
   Mexico while transactional email does not.

10. **WebAuthn/passkeys are now a build, not a setting.** Recorded 2026-09-04,
    replacing the prior item on unconfirmed Cognito passkey availability in
    mx-central-1 — that question is moot with the provider retired, and is struck
    rather than carried. Native WebAuthn was a **disqualifying requirement** in
    the original provider selection, and the prior provider satisfied it natively:
    adopting passkeys was to be a configuration change. It is now a construction —
    building and integrating a WebAuthn provider into this identity layer, e.g.
    `@simplewebauthn` or Auth.js's own WebAuthn provider, with credential storage,
    attestation handling, registration and authentication ceremonies, and a
    migration path for identities already enrolled in TOTP.
    **No date is committed, and this does not block v1.0**, for the reason the
    original requirement anticipated rather than in spite of it: passkeys are not
    enabled in v1.0 either way. What changed is the cost of enabling them later,
    and the requirement that the build land *inside* this identity layer rather
    than by migrating off it (see Authentication).
    _Review trigger:_ item 1's trigger — the first corporate client that requires
    phishing resistance in a security due diligence review — reaching which now
    means scheduling development rather than changing a setting.

11. **TOTP secret custody is this product's responsibility, and TOTP secrets
    cannot be hashed.** Recorded 2026-09-04, and deliberately separate from item 8:
    a backup code is verified by comparing hashes and therefore never needs to be
    recoverable, while a TOTP secret MUST be readable on every verification. That
    single difference makes it the most sensitive recoverable material in the
    database — a working second factor, derivable by anyone who can read the
    column. The controls are in *Custody of TOTP secrets* under Authentication:
    encryption at rest under an application-held key separate from the database
    (envelope encryption or KMS), absolute exclusion from logs and the audit log,
    key access restricted and audited to the PAC/CSD standard, no archetype ever
    reading a secret, and blocking coverage. Owned by slice 003.
    _Why it is debt and not merely a requirement:_ this product now holds material
    whose compromise is an authentication bypass across every tenant at once, and
    the control protecting it is key management — an operational discipline, not a
    test that can prove itself green forever. A restored backup in a
    less-protected environment is the realistic failure mode, and it is the one to
    review.
    _Review trigger:_ the first environment that restores a production backup, and
    any change to where the application key is held.

Item 12 (the 004 archetype matrix did not exist yet — only SA was ever granted
anything, and `plan.entitlements` was written and read by nothing) is **struck**:
slice 004 shipped the full matrix, the entitlement mechanism, and the scope port.

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
  Entering Fase 1 with open pendings is a governance violation. **Two remain: PAC
  selection, and the scope of the AWS account blockage** (Data Residency, opened
  2026-09-04). The identity amendment closed no pending and opened one — it
  replaced a decision that was already closed, and the pending it added records a
  fact about the blockage that motivated it rather than a choice still to be made.
- Relaxing a principle de facto — without an amendment — invalidates the
  authority of the entire document. If a principle cannot be met, it is amended
  or removed; it is not ignored.

---

## Consequences of the v1.5.0 Amendment

What the 2026-09-04 identity amendment leaves stale elsewhere in the repository.
**None of these blocks a merge that has already happened**, and none is corrected
in the amendment's own PR — a PR is scoped to a single slice directory plus its
own catalog row (Merge Rules), and this one is scoped to the constitution.

| Artifact | What is now stale | Blocks? | Who corrects it, and when |
|---|---|---|---|
| `specs/002-identity-membership/spec.md` | Names Cognito in **Dependencies** and **Out-of-Scope**. The slice's shipped behaviour is unaffected — 002 never called Cognito; it deliberately trusted no token claim for tenant or archetype (`002/FR-016`), which is exactly why this amendment touches no shipped code. | **No.** 002 is merged and its tests pass unedited. | A separate PR against `specs/002-identity-membership/` only. Text-only correction; no task is reopened and no code changes. |
| `specs/003-authentication-mfa/` | Does not exist. It was blocked on AWS account access; that blocker is now removed by this amendment. Its `plan.md` must be written against NextAuth + `otplib`, and must cover the three constructions this document assigns it: MFA enforcement, backup codes, TOTP secret custody. | **No** — nothing to block. | `/speckit-specify` then `/speckit-plan` on a new `003` directory. This is the amendment's whole point. |
| `specs/005-session-lifecycle/` | Does not exist. Was blocked transitively behind 003. Any prior note that revocation must propagate to an external provider is void — Sessions no longer says so. | **No.** | After 003. Step-up MFA remains 005's, unchanged by this amendment. |
| `specs/016a-frontend-shell/` | Shipped `principal.fixture.json` as the documented seam for a login that did not exist (`016a`/FR-023, research.md D5). The fixture is still correct as a seam; what changes is what replaces it. | **No.** The seam was built to be replaced wholesale by one file. | Slice 003, replacing `src/session/principal.ts`. `016a` needs no amendment. |
| `specs/registro-specs-mvp.md` | Lists `003` as blocked by *"Verificar passkeys de Cognito en `mx-central-1`… Requiere acceso a AWS"*, and carries that blocker as item 2 of §4 — which propagates to `005` and `016`. All of it is superseded. | **No.** Coordination document, not a SpecKit artifact. | Whoever next updates the registro. Note it is dated 2026-08-21 and is already stale on other rows (it lists `004`, `006` and `007` as *POR ESCRIBIR*; all three have shipped). |
| `infra/` (Terraform) | Provisions no Cognito today, so nothing to remove. Its region assumption depends on the new `[PENDING]` above, not on this amendment. | **No.** | Only if the AWS blockage turns out to be account-wide. |
| Privacy notice / LFPDPPP text | Previously had to name an identity processor. It no longer does — identity data stays in RDS in mx-central-1. The transactional-email transfer (Technical Debt item 9) is unaffected and must still be declared. | **No.** | Whoever owns the privacy notice, when it is next revised. This change removes an obligation rather than adding one. |
| Commercial / sales material | The "identity data resident in Mexico" claim is **strengthened**, not weakened. The prohibition on claiming phishing resistance (Technical Debt item 1) is unchanged and now harder to lift. Any material citing a Cognito MAU allowance as the cost basis is stale. | **No.** | CC commercial, when next revised. |

**Not affected, stated explicitly so it is not re-litigated:** the archetype codes
and the permission matrix; SMS prohibited; Email OTP deferred (its Cognito-specific
rationale is marked superseded, the deferral itself untouched); step-up MFA as
slice 005's; case-file data residency; the RLS mechanism and the null-safe
predicate rule; every slice already merged.

---

**Version:** 1.5.0 | **Ratified:** 2026-08-14 | **Last Amended:** 2026-09-04

### Amendment History

- **1.5.0** — **Identity provider replaced: Amazon Cognito → self-hosted NextAuth
  (Auth.js) Credentials provider + `otplib` TOTP, on this product's own
  PostgreSQL.** The Cognito decision is marked **Superseded 2026-09-04** and
  retained rather than deleted. Reason: the AWS account access required to
  provision the user pool and to confirm passkey availability in mx-central-1 is
  blocked with no committed date, and it was holding slice `003`, and behind it
  `005`, `016a`'s real login, and every authenticated capability. New rationale:
  no dependency on an uncontrolled AWS account; identity and session data entirely
  in this product's own Postgres under RLS with no external processor, which
  strengthens the residency argument rather than weakening it; zero per-MAU cost
  at every scale. **Mandatory MFA restated as a code obligation** — no flag,
  env var, entitlement or per-tenant setting may disable enrollment or the
  challenge, such a mechanism may not exist, and coverage of the enforcement path
  is blocking in CI at the same level as tenant isolation. **Backup code custody
  reformulated from a "named exception" into a positive design obligation** (there
  is no longer an external MFA provider for it to be an exception to), with every
  prior requirement intact: Argon2id/scrypt, single-use, re-issuance replaces the
  set, issuance/consumption/exhaustion/re-issuance audited, no archetype reads any
  code, blocking coverage. **New: custody of TOTP secrets** — not hashable because
  they must be readable on every verification, therefore encrypted at rest under
  an application key separate from the database (envelope encryption or KMS),
  never in logs or the audit log, key access restricted and audited to the PAC/CSD
  standard, blocking coverage. Sessions: Cognito `GlobalSignOut`/`RevokeToken` and
  the "no API to list sessions" note removed; product-owned sessions unchanged.
  Data Residency: Cognito user pools removed from the verified-services list, the
  mx-central-1 infrastructure decision explicitly unchanged, and **a new
  `[PENDING]` recording that the scope of the AWS account blockage is unconfirmed**
  — recorded rather than assumed, because an account-wide blockage would make the
  region, not the provider, the affected decision. Technical Debt: item 1's remedy
  reclassified from configuration to build; item 2's MAU argument retired and the
  support-volume argument isolated; item 8 reframed as permanent design rather
  than a vendor concession, its review trigger withdrawn as vacuous; the item on
  unconfirmed Cognito passkey regional availability **struck** and replaced by
  **new item 10 (WebAuthn/passkeys are a build, no date committed, does not block
  v1.0)**; **new item 11 (TOTP secret custody)**, kept separate from item 8
  because a hashable secret and a readable one are different problems. Technology
  Constraints: the `Auth:` stack line and the provider-derived section rewritten,
  the latter adding that `identity` and the session table are tenant-global by
  design and are the documented exception to the RLS catalogue check. Blocking
  coverage list extended with MFA enforcement and TOTP secret handling. Governance
  pending count 1 → 2. Added the **Consequences of the v1.5.0 Amendment** table.
  Untouched by design: SMS prohibited, Email OTP deferred, archetypes, permission
  matrix, step-up MFA as slice 005's, case-file residency.

- **1.4.1** — Corrected the third row of the NestJS cross-cutting mechanism table:
  "Tier entitlement → Global guard" is now "Global interceptor", the same
  correction v1.4.0 applied to the first two rows and missed on this one. A Guard
  cannot see the tenant's plan for the same reason it cannot see the resolved
  principal — both are set by interceptors that run after every Guard. Slice 004
  shipped `AuthorizationInterceptor`, deciding permission, scope and entitlement
  together. Walking skeleton item 4 marked complete; Recognised Technical Debt
  item 11 struck — that was the absent-archetype-matrix item, which v1.5.0's
  renumbering moved to item 12; it is not the TOTP custody item that holds number
  11 today.
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
