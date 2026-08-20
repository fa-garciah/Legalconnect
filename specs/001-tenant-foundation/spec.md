# Feature Specification: Tenant Foundation & Audit Log

**Feature Branch**: `001-tenant-foundation`

**Created**: 2026-08-19

**Status**: Draft

**Epic**: EP00-PlatformFoundation

**Constitution**: v1.3.0

**Tier Classification**: Cross-cutting — this slice is not tier-restricted. It builds the mechanism that later slices use to enforce tier entitlements.

**Input**: User description: "Feature Spec 001 — Tenant Foundation & Audit Log. Tenant separation and append-only audit log as the first deliverable slice of EP00-PlatformFoundation. Covers nine EP00-FND catalog stories (US01–US08 and US10): provision a firm as an isolated tenant, assign and change its iguala plan, guarantee data isolation between tenants, record every mutation in an append-only log, and query that log scoped to own tenant. Identity, sessions, permissions and MFA recovery are separate slices."

## Why This Slice Is First

No business feature can be specified or built before tenant separation and the audit log exist. This slice is also the only one specifiable before Fase 0 closes: its content is determined by the constitution, not by Discovery findings.

Scope is deliberately narrow. Identity, sessions, permissions and MFA recovery are separate slices.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Guarantee data isolation between tenants (Priority: P1)

*US03-EP00-FND-EnforceTenantIsolation*, *US10-EP00-FND-LogCrossTenantAttempt*

A firm's data must be unreachable from any other firm. When a request or job runs on behalf of one firm, the data layer itself confines every read and write to that firm, so that a developer who forgets to narrow a query receives nothing rather than another firm's records.

**Why this priority**: Principle II is NON-NEGOTIABLE and every other story in this slice is unsafe without it. The data is covered by attorney-client privilege; a single leak between two firms litigating against each other ends the product. Building provisioning or auditing first would mean storing privileged data before the boundary protecting it exists.

**Independent Test**: Seed two tenants with records directly, open a session bound to tenant A, execute a read that carries no tenant condition, and assert zero records belonging to tenant B are returned. Requires no provisioning flow and no user interface.

**Acceptance Scenarios**:

1. **Given** a read written without an explicit tenant condition, **When** it executes within a session bound to a tenant, **Then** it returns zero records belonging to any other tenant.
2. **Given** an authenticated user of tenant A, **When** they request any resource belonging to tenant B, **Then** the response is indistinguishable from that resource not existing, revealing nothing about its existence, and the attempt is recorded in the audit log.
3. **Given** a write that carries no explicit tenant value, **When** it executes within a session bound to a tenant, **Then** the record is attributed to that tenant and cannot be attributed to another.
4. **Given** an asynchronous job, a queued message, a cache entry, a stored file or a backup, **When** it is created or read, **Then** it is confined to exactly one tenant.
5. **Given** a newly added store of tenant data with no isolation rule attached, **When** the automated verification runs, **Then** it reports a failure rather than passing silently.
6. **Given** an identity holding live membership in both tenant A and tenant B, **When** it operates with tenant A active, **Then** reads and writes reach only tenant A's records, and nothing in any response reveals that the tenant B membership exists.
7. **Given** a request that names a tenant the acting identity holds no live membership in, **When** it is processed, **Then** it is refused as a cross-tenant access attempt and recorded as such.

---

### User Story 2 - Record every mutation in an append-only log (Priority: P2)

*US06-EP00-FND-WriteAuditEvent*, *US07-EP00-FND-EnforceAuditImmutability*

Every change to the system is recorded once, automatically, in a log that normal operation can add to but never alter or erase. The record identifies who acted, what they did, on which entity, when, from where, and for which firm.

**Why this priority**: Principle V, and the only detection net available while the authentication factor is not phishing-resistant. Provisioning (Story 3) cannot satisfy its own acceptance criteria until audit writing exists, so this precedes it.

**Independent Test**: Trigger any one mutation and assert exactly one audit record was created carrying all six required fields; then attempt to modify and to delete that record through the application and assert both fail.

**Acceptance Scenarios**:

1. **Given** an existing audit record, **When** any application component attempts to modify or delete it, **Then** the operation fails at the data permission level rather than being merely disallowed by application code.
2. **Given** any mutation listed in FR-014, **When** it completes successfully, **Then** exactly one audit record exists for it, carrying actor, action, target entity, timestamp, source and tenant.
3. **Given** a mutation whose audit record cannot be written, **When** the operation is attempted, **Then** the mutation does not take effect.
4. **Given** any audit record, **When** its contents are inspected, **Then** they contain no end-client personal data, no secrets and no authentication factors.
5. **Given** two mutations occurring in the same instant, **When** both are recorded, **Then** each produces its own distinct, individually addressable record.

---

### User Story 3 - Provision a new firm as an isolated tenant (Priority: P3)

*US01-EP00-FND-ProvisionTenant*, *US04-EP00-FND-DeactivateTenant*

When Cosmic Chimps contracts a new firm, an operator creates that firm as a tenant with its commercial identity and its contracted iguala plan. From that moment the firm has a data space no other tenant can reach.

**Why this priority**: This is what makes the isolation boundary usable, but it depends on Stories 1 and 2 already standing. In this slice it is an internal operation performed by the platform operator, not a user-facing flow.

**Independent Test**: Provision a tenant with a name, RFC and plan; assert the tenant exists, is active, is reachable only within its own scope, and that exactly one creation event appears in the audit log.

**Acceptance Scenarios**:

1. **Given** Cosmic Chimps has contracted a new firm, **When** the tenant is provisioned with name, RFC and iguala plan, **Then** an isolated tenant exists and the creation event is recorded in the audit log.
2. **Given** a provisioning attempt whose RFC already belongs to an existing tenant, **When** it is submitted, **Then** it is rejected and no partial tenant is created.
3. **Given** an existing tenant, **When** it must stop operating, **Then** it is deactivated rather than erased, and the deactivation is recorded in the audit log.
4. **Given** a deactivated tenant, **When** any access to its data is attempted, **Then** the access is refused and its records remain intact.
5. **Given** a provisioning operation that fails partway, **When** it terminates, **Then** no tenant exists in a partially created state.

---

### User Story 4 - Query the audit log scoped to own tenant (Priority: P4)

*US08-EP00-FND-QueryAuditLog*

An authorized person at a firm can read that firm's own audit history — and only that firm's — to answer who did what and when.

**Why this priority**: Delivers the evidentiary value of the log to the firm, and is required for servicing ARCO rights under LFPDPPP. Depends on Story 2 having written records.

**Independent Test**: With records seeded for two tenants, query as an authorized user of tenant A and assert every returned event belongs to tenant A and none to tenant B.

**Acceptance Scenarios**:

1. **Given** an authorized user querying the audit log, **When** results are returned, **Then** only events of their own tenant are visible.
2. **Given** a user without the authorizing permission, **When** they attempt to query the audit log, **Then** access is refused.
3. **Given** an audit log query, **When** it completes, **Then** the query itself is recorded in the audit log.
4. **Given** a query whose result set is large, **When** results are returned, **Then** they are returned in bounded portions rather than in full.
5. **Given** audit entries spanning more than 24 months, **When** an authorized user queries the full available history, **Then** every entry within 24 months is returned and no entry older than 24 months is present.

---

### User Story 5 - Assign and change a tenant's iguala plan (Priority: P5)

*US02-EP00-FND-AssignTenantPlan*, *US05-EP00-FND-ConfigureTenantLimits*

Each firm is on one of three iguala tiers. An operator can assign that tier at provisioning and change it afterwards as the commercial relationship changes, without waiting for a software release.

**Why this priority**: The billing mechanic of the iguala and the seat of tier entitlements, but nothing in this slice consumes the plan yet — enforcement arrives in slice 004. Lowest priority here while still being required to exist from day one.

**Independent Test**: Assign a plan at provisioning, then change it to a different tier and assert the new tier is in effect and the change is recorded in the audit log, with no software release performed.

**Acceptance Scenarios**:

1. **Given** a tenant on one iguala plan, **When** an operator changes it to another, **Then** the new plan takes effect without a code deployment and the change is recorded in the audit log.
2. **Given** a plan, **When** its quantitative limits are adjusted, **Then** the adjustment takes effect without a code deployment.
3. **Given** a tenant, **When** its plan is inspected, **Then** exactly one of Esencial, Profesional or Premium is in effect.
4. **Given** a plan change to a tier whose limits the tenant currently exceeds, **When** it is submitted, **Then** the operator is told which limits are exceeded before the change is confirmed.

---

### Edge Cases

- What happens when a tenant is deactivated while one of its users holds a live session?
- What happens when two provisioning operations submit the same RFC at the same instant?
- What happens when the audit store is unavailable at the moment a mutation is attempted?
- What happens when an operator performs a platform-level action that spans tenants — under which tenant is that event recorded?
- What happens when a plan's quantitative limits are lowered below a tenant's current consumption?
- How does the system handle an audit query that spans a period containing millions of events?
- How does the system handle an RFC that is syntactically invalid, or a name that is empty?
- What is the authoritative time source for audit timestamps, and what happens when a component's clock disagrees with it?
- What happens to a tenant's stored files, queued messages and backups when that tenant is deactivated?

## Requirements *(mandatory)*

### Functional Requirements

**Tenant**

- **FR-001**: The system MUST support multiple tenants with absolute data isolation.
- **FR-002**: Every record containing tenant data MUST belong to exactly one tenant.
- **FR-003**: Isolation MUST be enforced at the data layer, not by application code. A read missing an explicit tenant condition MUST return zero records belonging to other tenants.
- **FR-004**: Each tenant MUST have exactly one iguala plan in effect (Esencial, Profesional or Premium), changeable without a code deployment.
- **FR-005**: Isolation MUST also apply to asynchronous jobs, queues, caches, stored files, logs and backups.
- **FR-006**: Tenants MUST never be hard-deleted; they MUST be deactivated, retaining their records.
- **FR-007**: A tenant MUST carry a commercial identity comprising at minimum a name and an RFC, and the RFC MUST be unique across tenants.
- **FR-008**: A cross-tenant access attempt MUST produce a response indistinguishable from the requested resource not existing, revealing nothing about its existence.
- **FR-009**: Provisioning, deactivation and plan changes MUST execute in a platform administration context that is not a tenant session, and MUST NOT be reachable through tenant-scoped application paths.
- **FR-015**: A store of tenant data without an active isolation rule MUST cause automated verification to fail rather than pass silently.
- **FR-016**: Quantitative plan limits (users, storage, monthly CFDI issued) MUST be configurable per plan without a code deployment.

**Audit log**

- **FR-010**: The audit log MUST be append-only and MUST record, for every entry: actor, action, target entity, timestamp, source and tenant.
- **FR-011**: The application MUST hold no permission to update or delete audit records; the prohibition MUST be enforced at the data permission level.
- **FR-012**: The audit log MUST contain no end-client personal data, no secrets and no authentication factors.
- **FR-013**: The audit log MUST be queryable by an authorized role, scoped to that role's own tenant, and results MUST be returned in bounded portions.
- **FR-014**: The events audited in this slice MUST be these **seven**: tenant provisioning, tenant deactivation, tenant plan change, plan limit or entitlement configuration change, cross-tenant access attempt, audit log query, and **platform read of the tenant registry**.
- **FR-025**: The audit log query event MUST be recorded only when the read is interactive. Automated or system-initiated reads of the audit log — health checks, export jobs, monitoring — MUST NOT produce an entry, so that reading the log cannot inflate it without bound.
- **FR-017**: A mutation whose audit entry cannot be recorded MUST NOT take effect.
- **FR-018**: Every audit entry MUST be individually addressable and distinguishable from entries recorded in the same instant.
- **FR-019**: Audit entries MUST be retained for **24 months** and MUST remain queryable by an authorized role for that entire period. Entries that pass 24 months MUST be removed by a defined deletion routine rather than accumulating indefinitely, and that removal MUST NOT be performable ad hoc by the application.
- **FR-020**: Timestamps MUST derive from a single authoritative time source, not from the clock of the component emitting the event.

**Identity scope**

*Decided 2026-08-19 by the CC technical lead, closing Constitution Technical Debt item 8.*

- **FR-021**: A person MUST be able to hold access to more than one tenant. **Identity** (who the person is) and **membership** (the access one identity holds within one tenant) MUST be distinct concepts, so that a single identity may hold membership in several tenants.
- **FR-022**: Exactly one tenant MUST be active for the whole duration of any single request or job. The active tenant MUST be one the acting identity holds a live membership in. A request naming a tenant the identity holds no live membership in MUST be treated as a cross-tenant access attempt under FR-008.
- **FR-023**: A tenant MUST NOT be able to observe that one of its members holds membership in any other tenant, nor how many. The set of tenants an identity belongs to is not tenant-visible data.
- **FR-024**: An archetype MUST be a property of a membership, not of an identity. The same person MAY hold different archetypes in different tenants.
- **FR-026**: Reading the tenant registry from the platform administration context MUST be recorded in the audit log under `tenant.registry_read`, following the same channel rule as the audit log query event (FR-025): emitted only when `source.channel = 'interactive'`, never for automated or system-initiated reads.
  *Rationale:* the tenant registry carries each firm's name, RFC and commercial plan. Under Principle V, a platform operator browsing that registry without a business need is exactly the kind of access this constitution requires to leave a trace. Leaving it unaudited while the audit log query was audited was an inconsistency identified during plan review, not a deliberate exception.

The identity and membership entities themselves, and the tenant selector this
decision implies at sign-in, are built in slices 002 and 003. This slice records
the decision because it determines the contract of its own tenant-context
mechanism: that mechanism receives an explicit tenant and MUST verify membership
before activating it, rather than deriving a single tenant from the identity.

### Permission Matrix *(required by Principle IV)*

Deny by default. Any archetype not listed has no access to any capability in this table.

| Capability | Platform Operator (Cosmic Chimps, internal) | SA (System Administrator, per tenant) | MP / AA / PL / CM / BM (internal firm roles) | Portal archetypes (IC, CB, EL, corporate client, third parties) |
|---|---|---|---|---|
| Provision tenant | Create | Deny | Deny | Deny |
| Read tenant commercial identity | Read (all tenants) | Read (own tenant) | Deny | Deny |
| Update tenant commercial identity | Update | Deny | Deny | Deny |
| Deactivate tenant | Update | Deny | Deny | Deny |
| Hard-delete tenant | Deny (no archetype holds it) | Deny | Deny | Deny |
| Assign or change iguala plan | Update | Deny | Deny | Deny |
| Configure plan limits | Update | Deny | Deny | Deny |
| Read own tenant's plan in effect | Read | Read | Deny | Deny |
| Write audit entry | System only — no archetype writes directly | System only | System only | System only |
| Read audit log | Read (platform administration context) | Read (own tenant) | Deny | Deny |
| Update or delete audit entry | Deny (no archetype holds it) | Deny | Deny | Deny |
| Export audit log | Deny — deferred, not in this slice | Deny | Deny | Deny |

Notes on this matrix:

- The Platform Operator acts in the platform administration context of FR-009. Its cross-tenant reach is the single deliberate exception to tenant-scoped access, and it exists outside the tenant session mechanism rather than as a privileged path through it.
- Plan changes are a commercial act between Cosmic Chimps and the firm; SA deliberately cannot self-upgrade.
- Audit entries are written by the system as a consequence of mutations, never by an actor invoking a write capability.
- Export is deliberately absent. Introducing it requires its own specification, including which personal data may leave the system.
- Per FR-024, every archetype column in this matrix describes a **membership**, not an identity. The same person may appear as SA in one tenant and as a portal archetype in another; each membership is evaluated independently, and neither can see the other (FR-023).
- "Read (all tenants)" for the Platform Operator is not a membership. It is the platform administration context of FR-009, which exists outside the membership mechanism entirely.

### Key Entities *(include if feature involves data)*

- **Tenant**: A contracted firm, and the root of the isolation boundary. Carries a name, an RFC unique across tenants, exactly one iguala plan in effect, and an active or deactivated status. Never erased.
- **Plan**: One of three iguala tiers (Esencial, Profesional, Premium), carrying its entitlements and its quantitative limits. Limits and the feature-to-tier mapping are configuration, changeable without a code deployment.
- **AuditEvent**: One append-only record of one action, carrying actor, action, target entity, timestamp, source and tenant. Individually addressable, never altered, never erased by normal operation, and free of end-client personal data, secrets and authentication factors. Retained 24 months.

Two further entities follow from FR-021 but are **owned by slice 002**, not defined here. They are named so this slice's tenant-context contract has something to refer to:

- **Identity** *(slice 002)*: the person, as recognised by the external identity provider. Holds no tenant.
- **Membership** *(slice 002)*: the access one identity holds within one tenant, carrying that tenant's archetype for that person, and a live/revoked status. One identity may hold many; one tenant sees only its own.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of stores holding tenant data return zero records of other tenants when read without an explicit tenant condition, verified automatically on every build.
- **SC-002**: 100% of request paths and asynchronous jobs carry a passing cross-tenant leak test, as a condition of being considered done.
- **SC-003**: In 100% of cross-tenant access attempts, the response is indistinguishable from the resource not existing; 0 responses reveal existence and 0 return the resource.
- **SC-004**: Each of the seven audited operations produces exactly one audit entry — 0 missing and 0 duplicated — verified automatically. For the two channel-gated events — audit log query (FR-025) and platform registry read (FR-026) — "each" means each interactive read, and an automated read produces 0 entries.
- **SC-005**: 0 attempts to modify or delete an audit entry succeed, including attempts made through the application's own data access path.
- **SC-006**: 0 audit entries contain end-client personal data, secrets or authentication factors, verified by automated inspection of entry contents.
- **SC-007**: An authorized user's audit query returns 0 events belonging to another tenant across all test scenarios.
- **SC-008**: A tenant's iguala plan, and a plan's quantitative limits, can each be changed and observed in effect with 0 software releases performed.
- **SC-009**: Adding a new store of tenant data without an isolation rule fails the build in 100% of cases.
- **SC-010**: An authorized audit query over a tenant's full retained history returns its first portion of results in under 3 seconds.
- **SC-011**: 0 tenants can be hard-deleted through any available capability.
- **SC-012**: A mutation whose audit entry cannot be recorded leaves 0 observable effects.
- **SC-013**: An audit query covering a period that extends beyond 24 months returns 100% of entries inside the window and 0 entries outside it.
- **SC-014**: For an identity holding membership in more than one tenant, 0 responses in any tenant reveal the existence, count or identity of its other memberships.
- **SC-015**: An interactive read of the audit log produces exactly 1 new entry; an automated read produces 0. Verified in both directions.

## Assumptions

- Provisioning in this slice is an internal Cosmic Chimps operation, not a self-service or user-facing flow. Self-service tenant signup is out of scope.
- The platform administration context of FR-009 is assumed to be operable by Cosmic Chimps staff without a tenant session. Its own authentication, and the step-up requirements the constitution places on sensitive operations, are specified in slices 002, 003 and 005 — this slice assumes they will exist and does not define them.
- Audit entries are assumed to be recorded as a consequence of mutations by a single shared mechanism rather than by each operation individually, so that omitting one is an explicit act rather than an oversight. The constitution requires this; the specific mechanism is a planning concern.
- "Actor" in an audit entry is assumed to identify the acting principal without embedding personal data beyond what identification requires.
- "Source" is assumed to mean the origin of the request as observed by the system, sufficient to distinguish interactive use from automated use.
- The three iguala tier names are treated as fixed for this slice. Which features map to which tier is configuration and is not decided here.
- Cross-tenant access attempts are assumed to be recordable against the tenant whose data was targeted, so that the affected firm can see the attempt in its own log.
- No user interface is assumed to be delivered by this slice beyond what is required to exercise the capabilities in the permission matrix.

## Dependencies

- **Constitution v1.3.0 Principle II** (Tenant Isolation is Absolute) and **Principle V** (Auditable by Construction) determine this slice's content. Any change to them changes this spec. v1.3.0 additionally fixes the required RLS predicate form and the no-context test case, both of which the plan artifacts follow.
- **Constitution `[PENDING]` — Data Residency region.** The hosting region must appear in the firm's privacy notice under LFPDPPP, and backups must reside in the same jurisdiction as the primary data. This is a constitution-level pending to be closed before the end of Fase 0; it constrains where this slice's data and its backups may live, but it is not a question this spec resolves.
- **Constitution `[PENDING]` — external IdP selection.** Not required to build this slice, but required before the identity slice (002) that follows it.
- **Slices 002–004** depend on this one. The walking skeleton that is the entry condition to Fase 1 is complete when 001–004 are delivered.
- **Principle I traceability**: satisfied. `specs/master-user-story-catalog.md` is present (169 stories, EP00–EP16) and registers EP00-PlatformFoundation with 15 stories. This slice delivers **nine** of them: US01, US02, US03, US04, US05, US06, US07, US08 and US10. The remaining six — US09 (export, slice IT2) and US11 to US15 (permissions, roles, entitlement gate, permission-change audit) — belong to later slices, and the catalog's own slice column agrees.

## Out of Scope

Identity, enrollment, sessions, MFA and its recovery, the permissions matrix mechanism itself, entitlement enforcement, self-service tenant signup, audit log export, and every business feature. Provisioning here is an internal operation, not a user-facing flow.

## Resolved Decisions

Both questions that previously blocked this spec were closed on 2026-08-19 by the
CC technical lead.

| # | Question | Decision | Where it lands |
|---|---|---|---|
| 1 | Can a person hold access to more than one tenant? | **Yes.** Identity and membership are separate concepts; an archetype is a property of a membership. | FR-021 to FR-024, US1 scenarios 6–7, SC-014. Constitution Technical Debt item 8 is closed by this decision and should be struck from the constitution at its next amendment. |
| 2 | Audit log retention period | **24 months**, queryable throughout, with a defined deletion routine beyond it. | FR-019, US4 scenario 5, SC-013. Satisfies Principle VI's requirement that retention be defined per entity before go-live. |

**Still open, but outside this spec:** the hosting region remains a
constitution-level `[PENDING]` under Data Residency (see Dependencies). It blocks
production deployment, not this specification.

## Approval Checklist

- [x] No `[NEEDS CLARIFICATION]` left open
- [ ] No implementation or technology detail in this document
- [ ] Every requirement is test-verifiable
- [ ] Cross-tenant leak test defined and accepted (Principle II)
- [ ] Audit events enumerated per operation (Principle V)
- [ ] Permission matrix declared (Principle IV)
- [ ] Tier classification declared (Tier Entitlements)
- [x] EP00 registered in the epic catalog (Principle I)
- [x] The nine EP00-FND stories this slice delivers are present in `master-user-story-catalog.md` (Principle I)
- [ ] Approved by Cosmic Chimps technical lead
