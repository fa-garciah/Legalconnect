# Feature Specification: Administration Interface (System Configuration)

**Feature Branch**: `014-admin-ui`

**Created**: 2026-09-23

**Status**: Draft — awaiting CC technical-lead approval (0 open clarifications)

**Epic**: EP10-SystemConfiguration (CFG) — `US01-EP10-CFG-ManageUsers`, `US02-EP10-CFG-ManageRoles`, `US03-EP10-CFG-ConfigurePermissions`. `US04-EP10-CFG-ConfigureBillingParameters` is deferred to slice `010-billing-core` (Decision 2).

**Constitution**: v1.5.0

**Tier Classification**: Cross-cutting. Every firm must be able to administer its users, positions, and role assignments regardless of equal-tier classification. Not removed or disabled at any tier.

**Input**: Backlog catalog section `EP10-SystemConfiguration`, `specs/004-authorization-entitlements/spec.md` (Decision 4), `specs/017-firm-directory/spec.md`, and `specs/018-frontend-clients/spec.md`.

> **Citation convention.** Requirements of previous slices are cited as `001/FR-0NN`, `002/FR-0NN`, `004/FR-0NN`, `017/FR-0NN`, and `018/FR-0NN`. Bare `FR-0NN` refers to this document.

---

## Why This Slice Exists

The administrative capabilities of LegalConnect MX were architected and verified at the database and API layer during foundation slices:
1. `002-identity-membership` shipped endpoints to issue and revoke invitations and to revoke memberships.
2. `004-authorization-entitlements` shipped the compile-time capability matrix and the server-side archetype change endpoint.
3. `017-firm-directory` shipped tenant position catalog management and member position assignment.

However, none of these capabilities has an interface. The shell navigation menu item *"Configuración"* (`/configuracion`) is marked `available: false` because no user-facing screen exists. A tenant administrator today has no way to invite a colleague, assign an archetype, define organizational positions, or inspect the permission distribution of the platform.

Furthermore, a critical operational gap exists in the backend: `POST /tenant/invitations` generates an invitation reference token, hashes it, and discards the plaintext value under the expectation of automated email dispatch. Because the AWS account access is blocked and transactional email (SES) is unavailable in `mx-central-1`, no invitation email is dispatched. Consequently, no invitee can ever receive an invitation link to accept it at `/aceptar/{reference}`.

This slice delivers:
1. The administrative UI under `/configuracion` adhering to the `020-design-language` visual identity.
2. The resolution of the backend delivery gap: returning a single-use invitation link directly to the issuing administrator in the issue response so they can deliver it out-of-band.
3. The reconciliation of catalog story `US03-EP10-CFG-ConfigurePermissions` with Constitution Principle III and 004 Decision 4 by providing an authoritative read-only view of the compile-time capability matrix.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage Tenant Users and Invitations (Priority: P1) 🎯 MVP

*`US01-EP10-CFG-ManageUsers` (joint delivery with slices 002 and 004)*

A System Administrator (`SA`) or Managing Partner (`MP`) accesses the administrative interface to invite new members to the firm, monitor pending invitations, revoke pending invitations, view active team members, and deactivate (revoke) memberships when staff leave the firm.

Upon issuing an invitation, because automated email transport is blocked, the administrator receives a one-time copyable invitation link (`/aceptar/{reference}`) directly in the confirmation modal so they can transmit it to the invitee via their secure communication channel.

**Why this priority**: Without this journey, no firm can onboard users or remove departing personnel. It is the absolute prerequisite for real-world tenant operation.

**Independent Test**: An SA navigates to `/configuracion`, fills out the invitation form for an email address with archetype `AA`, receives the one-time acceptance URL, views the new entry in the pending invitations table, and observes the active members list.

**Acceptance Scenarios**:

1. **Given** an authenticated `SA` or `MP` on `/configuracion`, **When** they submit an invitation with a valid email and target archetype (equal to or narrower than their own), **Then** an invitation record is created and a modal displays the one-time link `/aceptar/{reference}` with a copy-to-clipboard action.
2. **Given** an issued invitation link displayed in the confirmation modal, **When** the administrator closes or dismisses the modal, **Then** the raw invitation link is cleared from memory and can never be re-read from the interface or API.
3. **Given** an authenticated `SA` or `MP`, **When** they view the pending invitations table, **Then** they see each pending invitation's target archetype, issuance timestamp, expiration date, and a "Revoke" button, with no email address or token hash displayed.
4. **Given** a pending invitation in the list, **When** an `SA` or `MP` clicks "Revoke" and confirms, **Then** `POST /tenant/invitations/:id/revoke` is executed and the row is removed from the active pending list.
5. **Given** an active tenant member in the directory table, **When** an `SA` or `MP` clicks "Desactivar usuario" (Revoke membership) and confirms, **Then** `PATCH /tenant/memberships/:id/revoke` is executed, the user is marked deactivated, and their access ceases on their next request.
6. **Given** the last live `SA` of the firm, **When** any administrator attempts to revoke their membership, **Then** the action is prevented client-side and refused server-side, ensuring the firm is never stranded without an administrator.
7. **Given** an `MP` attempting to invite someone with archetype `SA`, **When** the form is evaluated, **Then** the option `SA` is unavailable and disabled, because an issuer cannot grant an archetype broader than their own (`002/FR-021`).

---

### User Story 2 - Assign Archetypes and Manage Organizational Positions (Priority: P2)

*`US02-EP10-CFG-ManageRoles` (joint delivery with slices 002, 004, and 017)*

An `SA` assigns or updates the system archetype of existing firm members (e.g., promoting a Paralegal to Associate Attorney). Concurrently, an `MP` or `SA` maintains the firm's custom organizational position catalog (e.g., "Socio Fundador", "Asociado Senior", "Pasante") and assigns these positions to members independently of their archetypes.

**Why this priority**: Fulfills `US02-EP10-CFG-ManageRoles` under 004 Decision 4: an SA decides *which* fixed archetype a member holds, and an MP/SA decides which organizational title they hold in the firm directory.

**Independent Test**: An SA selects a member in the administration table, updates their archetype from `PL` to `AA`, and confirms the change commits and audits. An MP creates a new position "Socio Administrador" in the position catalog and assigns it to a colleague.

**Acceptance Scenarios**:

1. **Given** an authenticated `SA`, **When** they select an active member and change their archetype to any valid archetype, **Then** `PATCH /tenant/memberships/:id/archetype` is executed, the change is saved, and an audit entry is created.
2. **Given** an authenticated `MP` (who is not an `SA`), **When** they view member management, **Then** the control to change a member's archetype is hidden and disabled (`004/Decision 6` reserves archetype change to `SA`).
3. **Given** the last live `SA` of a firm, **When** they attempt to change their own archetype to `AA` or any non-SA archetype, **Then** the action is prevented and a warning is displayed explaining that a tenant must have at least one active System Administrator.
4. **Given** an `MP` or `SA`, **When** they navigate to the position catalog section, **Then** they can create a new position name; once saved, it is immediately available for assignment in the directory.
5. **Given** an existing active position in the catalog, **When** an `MP` or `SA` clicks "Retirar" (Retire), **Then** the position status becomes retired, preventing future assignments while preserving historical display on existing members.
6. **Given** an active member, **When** an `MP` or `SA` updates their assigned position, **Then** `PATCH /tenant/directory/entries/:membershipId/position` is called and the directory listing updates immediately.

---

### User Story 3 - Inspect Fixed Permissions Matrix (Priority: P3)

*`US03-EP10-CFG-ConfigurePermissions` (reconciled with 004 Decision 4)*

An administrator (`SA` or `MP`) reviews the system-wide permissions matrix in a read-only, structured view. The view displays all platform capabilities grouped by functional domain (Expedientes, Clientes, Documentos, Directorio, Configuración) and clearly depicts which archetypes hold each capability.

**Why this priority**: Resolves the open conflict in `master-user-story-catalog.md`. Because archetypes and capabilities are fixed in code (Principle III & 004 Decision 4), granular per-role editing cannot exist in the product core. Providing full transparency of the capability distribution enables administrators to make informed archetype assignments.

**Independent Test**: An SA navigates to the "Matriz de Permisos" tab on `/configuracion` and verifies that every capability registered in the system is visible with accurate indicators of which archetypes hold access.

**Acceptance Scenarios**:

1. **Given** an authenticated `SA` or `MP`, **When** they select the "Matriz de Permisos" tab, **Then** they see an authoritative, read-only matrix of capabilities categorized by domain.
2. **Given** the permissions matrix, **When** filtered by domain (e.g., "Expedientes" or "Documentos"), **Then** only capabilities relevant to that domain are displayed.
3. **Given** the permissions matrix view, **When** an administrator inspects any capability row, **Then** each internal archetype column (`MP`, `AA`, `PL`, `CM`, `BM`, `SA`) displays an explicit permitted (check) or denied (dash) status, with no editable checkboxes or mutation controls.
4. **Given** the permissions matrix view, **When** an administrator clicks on an informative banner, **Then** it explains that system permissions are fixed by system architecture and security standards to ensure ethical wall compliance and tenant data isolation.

---

### Edge Cases

- **One-time invitation link dismissal without copying**: Once dismissed, the raw token is gone. The administrator must revoke the pending invitation and issue a new one. The UI must explicitly warn the administrator before dismissing the link modal.
- **Inviting an email that already holds membership in the tenant**: Per `002/FR-029` and `002/FR-005` (enumeration resistance), the backend answers with the identical `201 Created` structure. The UI displays the success screen normally without leaking account presence.
- **Concurrent archetype change and revocation**: If admin A revokes a member while admin B changes their archetype, the losing operation receives a 404/409 error. The UI catches this and re-fetches the user list.
- **Attempting to revoke or demote the sole SA**: Both client-side validation and backend interceptors fail the request with a descriptive error message explaining the last-SA constraint.
- **Retired position assigned to members**: When a position is retired, members already holding it continue to display the title with a "(Retirado)" label, but the retired title cannot be chosen in assignment dropdowns.
- **Network failure during invitation issuance**: Standard `016a` error handling displays an error notification without leaving partial state.

---

## Requirements *(mandatory)*

### Functional Requirements

**Backend Invitation Link Delivery (Closing the Backend Gap)**
- **FR-001**: `POST /tenant/invitations` MUST return the relative invitation link `/aceptar/{rawReferenceToken}` in the `invitationLink` field of the `201 Created` response body.
- **FR-002**: The raw reference token and `invitationLink` MUST NOT be logged in application logs, audit logs, or error payloads.
- **FR-003**: The raw reference token MUST NOT be stored in the database (only its SHA-256 hash `reference_hash` is persisted).
- **FR-004**: `GET /tenant/invitations` MUST NOT return `invitationLink` or any token material. The link is retrievable strictly once, synchronously in the issuance response.

**User and Invitation Administration UI**
- **FR-005**: The `/configuracion` interface MUST provide an invitation form capturing `email` and `targetArchetype`.
- **FR-006**: The target archetype selector MUST only offer archetypes that are equal to or narrower in privilege than the acting administrator's archetype (`002/FR-021`). `MP` MUST NOT be offered `SA`.
- **FR-007**: Upon successful invitation creation, the interface MUST present the generated invitation link in a high-visibility modal with a single-click "Copiar enlace" button and an explicit warning that the link cannot be retrieved again after closing.
- **FR-008**: The interface MUST render a table of pending invitations listing target archetype, creation date, expiration date, and a revocation trigger.
- **FR-009**: Revoking an invitation MUST require explicit user confirmation before issuing `POST /tenant/invitations/:id/revoke`.
- **FR-010**: The interface MUST render an active members list displaying each member's **email**, position, archetype, and administrative actions. *Corrected on review: the draft listed a "member identifier", but no endpoint exposes a member's name or email today — only membership UUIDs — so an administrator could not tell who they were deactivating. Showing the email requires Decision 5.*
- **FR-011**: Deactivating a member MUST require explicit user confirmation and execute `PATCH /tenant/memberships/:id/revoke`.
- **FR-012**: The interface MUST disable and prevent revocation or demotion of the last remaining `SA` of the tenant.

**Role Assignment and Position Catalog UI**
- **FR-013**: The interface MUST provide an archetype change dialog for members, visible and operable exclusively by `SA` principals.
- **FR-014**: The archetype change dialog MUST enforce the last-SA invariant by disabling archetype modification on the sole `SA`.
- **FR-015**: The interface MUST provide a position catalog view displaying all custom positions defined for the tenant, their active/retired status, and creation date.
- **FR-016**: An `MP` or `SA` MUST be able to define a new position name via a dedicated modal, invoking `POST /tenant/directory/positions`.
- **FR-017**: An `MP` or `SA` MUST be able to retire an active position via `PATCH /tenant/directory/positions/:id/retire`.
- **FR-018**: An `MP` or `SA` MUST be able to assign an active position from the catalog to any member via `PATCH /tenant/directory/entries/:membershipId/position`.

**Permissions Matrix Transparency UI**
- **FR-019**: The interface MUST provide a read-only tabular view of the platform capability matrix, populated from the frontend capability mirror.
- **FR-020**: Capabilities MUST be grouped by functional domain: Usuarios e Identidad, Expedientes, Clientes, Documentos, Directorio y Organización, Auditoría y Sistema.
- **FR-021**: The matrix MUST display columns for the six internal archetypes (`MP`, `AA`, `PL`, `CM`, `BM`, `SA`).
- **FR-022**: The matrix MUST be strictly non-editable, with a callout note explaining that system capabilities are enforced uniformly by architectural code.

**Design System & Shell Integration**
- **FR-023**: All screens, modals, tables, and buttons MUST use design tokens from `020-design-language` (no hex color literals).
- **FR-024**: All interface copy, labels, validation errors, and confirmation dialogs MUST be written in Spanish.
- **FR-025**: The shell navigation registry (`frontend/src/shell/navigation-items.ts`) entry for `configuracion` MUST have `available: true` and restrict visibility to `requiredArchetypes: ['SA', 'MP']`.
- **FR-026**: Four actions on these screens are `stepUp: true` in `capability.ts` — `invitation.issue`, `invitation.revoke`, `membership.revoke`, `membership.change_archetype` (`005` US2). Before each, the interface MUST ask for a fresh authenticator code, exchange it at `POST /auth/step-up` for a single-use token scoped to that capability (2-minute expiry), and send it as `x-step-up-token` with the action. A wrong code MUST show `005`'s uniform refusal. *Added on review: neither the draft spec nor the first task list accounted for step-up.*
- **FR-027**: The frontend's credential proxy (`frontend/src/app/api/lc/[...path]/route.ts`) MUST forward `x-step-up-token`, and still never forward a browser-supplied `authorization` or `x-identity-id`. Without it, all four actions above fail from the browser even with a correct code.
- **FR-028**: `GET /tenant/invitations` MUST include `invitedEmail` for `SA` and `MP` (Decision 5, approved in full on 2026-09-23), reversing `002`'s deliberate omission; `002`'s contract is amended in the same PR.

---

### Capability Matrix Reference *(Principle IV)*

All operations consumed by this slice are already registered in the backend capability matrix (`004/spec.md` and `017/spec.md`):

| # | Capability | Route | Scope | MP | AA | PL | CM | BM | SA | PO |
|---|---|---|---|---|---|---|---|---|---|---|
| 2 | `invitation.issue` | `POST /tenant/invitations` | `tenant` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 3 | `invitation.revoke` | `POST /tenant/invitations/:id/revoke` | `tenant` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 4 | `invitation.read_pending` | `GET /tenant/invitations` | `tenant` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 6 | `membership.revoke` | `PATCH /tenant/memberships/:id/revoke` | `tenant` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 7 | `membership.change_archetype` | `PATCH /tenant/memberships/:id/archetype` | `tenant` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 22 | `directory.assign_position` | `PATCH /tenant/directory/entries/:membershipId/position` | `tenant` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 23 | `directory.manage_catalog` | `POST` & `PATCH .../positions` | `tenant` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 24 | `directory.read` | `GET /tenant/directory` & `.../positions` | `tenant` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

---

### Key Entities

- **Invitation**: Transient onboarding record. Key attributes: `id`, `targetArchetype`, `status` (`pending`, `accepted`, `revoked`), `issuedAt`, `expiresAt`, and transient single-use `invitationLink`.
- **Membership**: Binding between an identity and a tenant. Key attributes: `id`, `tenantId`, `archetype`, `status` (`active`, `revoked`).
- **DirectoryEntry**: Profile entry extending a membership. Key attributes: `membershipId`, `archetype`, `positionId`, `positionName`.
- **Position**: Firm-defined organizational title. Key attributes: `id`, `name`, `status` (`active`, `retired`).
- **CapabilityViewRow**: View-model entity for the permission transparency matrix. Key attributes: `capabilityId`, `domain`, `label`, `description`, `archetypes: Record<Archetype, boolean>`.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can complete an invitation and copy the generated one-time link in under 20 seconds.
- **SC-002**: 100% of invitation issue responses return `invitationLink` on creation, while 0% of subsequent list or query calls return the link or raw token.
- **SC-003**: Exactly 0 raw reference tokens or invitation links are emitted to application logs, audit logs, or error objects.
- **SC-004**: An SA can assign or update a member's archetype in under 3 clicks.
- **SC-005**: 100% of attempts to revoke or demote the last remaining `SA` are prevented client-side and rejected server-side.
- **SC-006**: The permissions matrix renders 100% of system capabilities defined in `authz/matrix.ts` across all 6 internal archetypes in read-only form.
- **SC-007**: 0 color literals exist in new frontend code (`grep` check for `#` or `rgb` in `src/app/configuracion/**` returns 0).
- **SC-008**: 100% of user-visible strings are in Spanish.
- **SC-009**: All feedback states (loading skeletons, empty tables, error retry banners) comply with `016a` and `018` specifications.

---

## Assumptions

- Out-of-band delivery of the invitation link (via firm email, corporate messaging, or secure note) is acceptable to client firms until transactional email infrastructure is provisioned.
- The accept link path `/aceptar/{reference}` is deployed and functional (built in slice `002-identity-membership`).
- Seniority and organizational hierarchy do not influence authorization decisions (per `004/Decision 2` and `017/spec.md`).
- Tenant members have unique positions assigned at any given time, or none.
- Step-up MFA mechanism belongs to slice `005-session-lifecycle`; until slice `005` ships, sensitive operations inherit the current session's authentication state.

---

## Out of Scope

- **US04-EP10-CFG-ConfigureBillingParameters**: Billing parameters depend on slice `010-billing-core` and the billing data model. Put out of scope for this slice; will be specified when `010-billing-core` is undertaken.
- **Automated transactional email dispatch**: Blocked by AWS account access restrictions.
- **Custom archetype definitions or per-tenant capability editing**: Explicitly forbidden by Constitution Principle III and 004 Decision 4.
- **Enterprise SSO / SAML configuration**: Explicit MVP prohibition in Constitution.
- **User password reset or credential custody**: Handled by self-hosted identity auth flow (`002` / `003`), not tenant administrative screens.

---

## Resolved Decisions

### Decision 1 — Reconciliation of US03 with 004 Decision 4 *(Requires CC technical-lead approval)*
- **Catalog description**: `US03-EP10-CFG-ConfigurePermissions` reads *"Granular permissions per role"*.
- **The Conflict**: 004 Decision 4 establishes that archetypes and the capability matrix are fixed in code as compile-time constants. Granting tenant administrators the ability to alter capability distributions violates Principle III (no tenant-specific logic in the core) and defeats exhaustive matrix verification.
- **Resolution**: `US03` is fulfilled as an **Authoritative Read-Only Capability Matrix View**. Administrators can inspect exactly what each role is permitted to do across all modules, providing full transparency without compromising system security invariants.
- **Approval status**: **approved by Francisco Garcia (CC technical lead), 2026-09-23**.

### Decision 2 — Deferral of US04-EP10-CFG-ConfigureBillingParameters
- **Catalog description**: `US04-EP10-CFG-ConfigureBillingParameters` reads *"Rates, tax rates, invoice templates"*.
- **The Dependency**: Requires billing rate models, tax configuration, and invoice schema owned by slice `010-billing-core` (which does not exist yet).
- **Resolution**: Explicitly deferred. `US04` will be delivered jointly with `010-billing-core`.
- **Approval status**: **approved by Francisco Garcia (CC technical lead), 2026-09-23**.

### Decision 3 — Out-of-Band Invitation Link Delivery *(Requires CC technical-lead approval)*
- **The Problem**: Automated email dispatch is impossible because the AWS account is blocked and SES is unavailable in `mx-central-1`. Discarding the raw token prevents invitees from onboarding.
- **Resolution**: `POST /tenant/invitations` returns `invitationLink: "/aceptar/<rawReferenceToken>"` synchronously in the `201 Created` response.
- **Security Reasoning**:
  1. The link is presented exclusively to the authenticated administrator who possesses the `invitation.issue` capability.
  2. The link is returned once and discarded from server memory.
  3. The database retains only the SHA-256 hash `reference_hash`.
  4. The link is never written to audit trails or application logs.
  5. The link alone does not grant access: acceptance succeeds only when the email entered matches the invitation's `invited_email` (`002/FR-024`), the reference is single-use and expires in 7 days, and second-factor enrollment is mandatory before any tenant data is reachable (`003`). *Corrected on review: the draft said the recipient must authenticate with existing credentials; an invitee has none yet.*
- **Approval status**: **approved by Francisco Garcia (CC technical lead), 2026-09-23**.

### Decision 5 — Showing members' email to the firm's administrators *(Requires CC technical-lead approval — personal data, Principle VI)*
- **The Gap** (found on review, not by the draft): no endpoint returns who a member IS. `GET /tenant/directory` returns `membershipId`, `archetype` and position only; `identity` has no name column, only `email`; and `lc_app` may read solely its OWN identity row (`identity_self_row`). A members list built on today's API is a list of UUIDs. `GET /tenant/invitations` likewise omits `invitedEmail` by deliberate choice in `002/contracts/tenant-invitations.md`.
- **Recommended resolution**: a new read, `GET /tenant/members` (capability `membership.read_tenant`, which already exists and is currently unused), returning `membershipId`, `email`, `archetype`, `positionName` for LIVE memberships of the ACTIVE tenant only. It needs one new RLS policy on `identity` for `lc_app`, admitting a row only when `app.tenant_id` is set AND the identity holds a live membership in that tenant — the mirror of migration `0043`'s guard, and covered by the isolation suite before it ships.
- **Why it is proportionate**: the firm's administrator issued the invitation to that email; the email is the firm's own staff data, not cross-tenant data; no other personal field exists to expose. It is still personal data under LFPDPPP, so reach is limited to `SA` and `MP` and every listing is audited.
- **Pending invitations**: recommended to show `invitedEmail` to the same roles, for the same reason — a pending list reading "AA, issued Tuesday" cannot be acted on. This reverses a deliberate `002` choice, so it needs explicit sign-off separately from the members list.
- **Approval status**: **approved by Francisco Garcia (CC technical lead), 2026-09-23**. Until signed, the members list may ship showing position and archetype only, clearly labelled as incomplete.

### Decision 4 — Administration Interface Layout & Navigation
- **Architecture**: A unified tabbed administration interface under `/configuracion`:
  - Tab 1: `Usuarios e Invitaciones` (default) — User list, pending invitations, issue invite dialog, deactivation.
  - Tab 2: `Cargos y Roles` — Position catalog, create/retire positions, archetype assignment, position assignment.
  - Tab 3: `Matriz de Permisos` — Domain-grouped read-only capability matrix.
- **Rationale**: Keeps all firm configuration in one cohesive space without fragmented sub-routes, maintaining high usability for managing partners and administrators.

---

## Dependencies

| Dependency | Purpose | Status |
|---|---|---|
| `001-tenant-foundation` | Tenant RLS, audit interceptor | Merged |
| `002-identity-membership` | Invitation model, membership table, accept route | Merged |
| `004-authorization-entitlements` | Capability matrix, `AuthorizationInterceptor` | Merged |
| `017-firm-directory` | Position catalog, directory entries | Merged |
| `016a-frontend-shell` | App router layout, navigation registry, feedback states | Merged |
| `018-frontend-clients` | Component primitives, `apiFetch` wrapper | Merged |
| `020-design-language` | Typography, spacing, color tokens | Merged |

---

## Traceability

| User Story ID | Title | Priority | Status in this Slice |
|---|---|---|---|
| `US01-EP10-CFG-ManageUsers` | Manage Users & Invitations | P1 | Delivered (screens + link return) |
| `US02-EP10-CFG-ManageRoles` | Assign Roles & Positions | P2 | Delivered (screens + position catalog) |
| `US03-EP10-CFG-ConfigurePermissions` | Inspect Permissions Matrix | P3 | Delivered (read-only transparency view) |
| `US04-EP10-CFG-ConfigureBillingParameters` | Configure Billing Parameters | — | Deferred to `010-billing-core` |

---

## Approval Checklist

- [x] Zero `[NEEDS CLARIFICATION]` markers in specification
- [x] Decision 1 (US03 Read-Only Matrix resolution) — **approved by Francisco Garcia (CC technical lead), 2026-09-23**
- [x] Decision 2 (US04 deferral) — **approved by Francisco Garcia (CC technical lead), 2026-09-23**
- [x] Decision 3 (Out-of-band one-time invitation link delivery & security reasoning) — **approved by Francisco Garcia (CC technical lead), 2026-09-23**
- [x] Decision 5 (members' and invitees' email shown to SA/MP — new RLS policy on `identity`) — **approved by Francisco Garcia (CC technical lead), 2026-09-23**
- [x] Permission matrix declared and verified against `004` and `017`
- [x] Strict TDD ordering established for implementation tasks (`tasks.md`)
