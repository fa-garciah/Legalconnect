# Implementation Plan: Administration Interface (System Configuration)

**Branch**: `014-admin-ui` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-admin-ui/spec.md`.

---

## Summary

This slice delivers the web interface for firm administration under `/configuracion` and closes the one critical backend gap in tenant onboarding:
1. **Backend gap closure**: Extends `POST /tenant/invitations` to return the relative invitation acceptance link `/aceptar/{rawReferenceToken}` in the `201 Created` response body so an administrator can copy and deliver it out-of-band while AWS transactional email is blocked.
2. **User & Invitation Management (`US01`)**: Renders member directory, pending invitations list, invitation issuance dialog with link modal, pending invitation revocation, and membership deactivation.
3. **Role & Position Management (`US02`)**: Renders member archetype assignment dialog (SA-only, with last-SA guard), tenant organizational position catalog, position creation/retirement, and position assignment to members.
4. **Permissions Transparency Matrix (`US03`)**: Renders an authoritative, read-only matrix of system capabilities by domain and archetype, resolving the catalog conflict with 004 Decision 4.
5. **Shell Integration**: Flips `configuracion` to `available: true` in `navigation-items.ts` with archetype gating for `['SA', 'MP']`.

---

## Technical Context

**Language/Version**: TypeScript 5.x, React 19.2, Next.js 16.3 (App Router), NestJS 10.x.

**Primary Dependencies**:
- Frontend: `@tanstack/react-query`, `lucide-react`, `radix-ui` primitives vendored in `components/ui`, `react-hook-form`, `zod`, `@hookform/resolvers`.
- Backend: `@nestjs/common`, `drizzle-orm`, `crypto` (native Node).

**Storage**:
- Existing PostgreSQL tables under Row-Level Security: `invitation`, `membership`, `directory_entry`, `position`.
- No new tables or schema migrations are required.

**Testing**:
- Backend: Jest + Supertest integration tests verifying invitation link return and audit isolation.
- Frontend: Vitest + Testing Library for unit and component tests; Playwright for end-to-end user journeys. Strict TDD workflow.

**Target Platform**: Responsive Web (desktop priority for administrative consoles).

**Project Type**: Web application (`backend/` minor contract fix + `frontend/` UI feature).

**Performance Goals**:
- Page load < 300ms p95 via same-origin proxy `/api/lc`.
- Instant clipboard copy feedback < 50ms.

**Constraints**:
- Absolute tenant isolation via RLS and `x-tenant-id`.
- Zero color literals (100% `020-design-language` semantic tokens).
- 100% Spanish interface copy.
- No plaintext token persistence or token logging in audit trails.

---

## Constitution Check

*GATE: Evaluated against LegalConnect MX Constitution v1.5.0.*

| # | Principle | Status | Justification & Verification |
|---|---|---|---|
| I | Spec-First Delivery (NON-NEGOTIABLE) | ✅ PASS | All stories trace to `master-user-story-catalog.md` (`US01`, `US02`, `US03`). Conflict in `US03` is formally resolved as read-only inspection; `US04` is formally deferred to `010-billing-core`. |
| II | Tenant Isolation is Absolute (NON-NEGOTIABLE) | ✅ PASS | All administrative queries and mutations run under tenant RLS. Frontend calls use `api-client.ts`, which attaches `x-tenant-id` to the same-origin proxy `/api/lc`. Cross-tenant invitations and modifications are rejected by existing policies. |
| III | Product Core vs. Tenant Customization | ✅ PASS | System archetypes and capabilities remain compile-time constants. Custom organizational titles are managed within tenant-scoped `position` catalog tables. Zero client-specific logic in the core. |
| IV | Least Privilege by Default | ✅ PASS | Every action is gated by backend `@Capability` declarations (`invitation.issue`, `invitation.revoke`, `invitation.read_pending`, `membership.change_archetype`, `membership.revoke`, `directory.assign_position`, `directory.manage_catalog`, `directory.read`). Frontend controls mirror these rules and hide unpermitted actions. Server decisions remain authoritative. |
| V | Auditable by Construction | ✅ PASS | All mutations (`invitation.issued`, `invitation.revoked`, `membership.revoked`, `membership.archetype_changed`, `directory.position_assigned`, `position.created`, `position.retired`) emit append-only audit entries. Sensitive invitation links are excluded from audit metadata. |
| VI | Compliance-by-Design | ⚠️ PASS, pending Decision 5 | Raw invitation tokens are generated in memory and hashed before persistence; the link is returned once and never logged or audited. **Decision 5 shows members' email to `SA`/`MP` of the same firm** — personal data under LFPDPPP, so it is limited to those two archetypes, scoped by RLS to the active tenant, and audited. It needs CC technical-lead sign-off before the members list shows email. *(Corrected on review: the draft described the data as minimal and did not account for member emails.)* |

---

## Project Structure

### Documentation (this feature)

```text
specs/014-admin-ui/
├── spec.md                   # Feature specification with user stories and requirements
├── plan.md                   # This file (Technical approach & constitution evaluation)
├── contracts/
│   └── admin-screens.md      # Screen routes, API contracts, states, backend gap fix
└── tasks.md                  # Strict TDD execution plan
```

### Source Code

```text
backend/
├── drizzle/
│   └── 0044_identity_email_for_tenant_admins.sql   # NEW (Decision 5): lc_app may read the email of an
│                                                    #   identity with a LIVE membership in the ACTIVE tenant
├── src/
│   └── modules/
│       ├── invitation/
│       │   ├── invitation.controller.ts    # MODIFIED: return invitationLink in issue() response
│       │   └── invitation.service.ts       # MODIFIED: already returns rawReferenceToken; the controller stops discarding it
│       └── membership/
│           └── members.controller.ts       # NEW (Decision 5): GET /tenant/members, capability membership.read_tenant
└── tests/
    ├── contract/
    │   ├── invitation-issue-link.test.ts   # NEW: link returned once, never on GET, never in audit or logs
    │   └── tenant-members.test.ts          # NEW (Decision 5): shape, SA/MP only, live memberships only
    └── integration/isolation/
        └── members-email-isolation.test.ts # NEW (Decision 5): a dual-membership identity acting in firm A
                                            #   never reads an email that belongs only to firm B

frontend/
├── src/
│   ├── app/
│   │   └── configuracion/
│   │       ├── page.tsx                    # Main admin dashboard with tabbed navigation
│   │       └── components/
│   │           ├── UserListTable.tsx            # Member directory & revocation trigger
│   │           ├── InviteUserDialog.tsx         # Invitation creation form
│   │           ├── InvitationLinkModal.tsx      # One-time link presentation & copy action
│   │           ├── PendingInvitationsTable.tsx  # Pending invitation list & revoke action
│   │           ├── ChangeArchetypeDialog.tsx    # SA-only archetype modifier with last-SA guard
│   │           ├── RevokeMembershipDialog.tsx   # Member deactivation confirmation modal
│   │           ├── PositionCatalogTable.tsx     # Firm positions list & retirement
│   │           ├── PositionCreateDialog.tsx     # New position modal
│   │           ├── AssignPositionDialog.tsx     # Assign position to member modal
│   │           └── PermissionsMatrixView.tsx    # Read-only capability transparency table
│   ├── configuracion/
│   │   ├── api.ts                          # Type-safe client calling /api/lc endpoints
│   │   ├── schema.ts                       # Zod validation schemas for forms
│   │   ├── types.ts                        # DTO interfaces and view models
│   │   └── matrix-view-model.ts            # Domain grouping & display mapping for capabilities
│   ├── authz/
│   │   └── capability-matrix.ts            # MODIFIED: mirror rows for invitation & directory
│   └── shell/
│       └── navigation-items.ts             # MODIFIED: set configuracion available: true for SA/MP
└── tests/
    ├── unit/
    │   ├── configuracion/
    │   │   ├── user-schema.test.ts         # Invitation and user form validation tests
    │   │   ├── position-schema.test.ts     # Position catalog validation tests
    │   │   └── matrix-view-model.test.ts   # Capability matrix domain grouping tests
    │   └── shell-navigation.test.ts        # Navigation availability and archetype gate test
    ├── component/
    │   └── configuracion/
    │       ├── InviteUserDialog.test.tsx
    │       ├── InvitationLinkModal.test.tsx
    │       ├── PendingInvitationsTable.test.tsx
    │       ├── UserListTable.test.tsx
    │       ├── ChangeArchetypeDialog.test.tsx
    │       ├── PositionCatalogTable.test.tsx
    │       └── PermissionsMatrixView.test.tsx
    └── e2e/
        └── configuracion.spec.ts           # End-to-end admin user journey tests
```

---

## Complexity Tracking

| Deviation / Decision | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Returning `invitationLink` in `POST /tenant/invitations` | Automated email delivery is blocked (AWS account access is suspended; SES is not available in mx-central-1). Without this link, invitations cannot be communicated to invitees. | Waiting for AWS account resolution: Blocks product adoption and halts live tenant testing indefinitely. |
| Reconciling `US03` as a Read-Only Matrix | Catalogs specify "granular permissions per role", which directly violates Principle III and 004 Decision 4 (fixed capability matrix). | Per-tenant permission editor: Introduces arbitrary permissions, breaks compile-time safety, and creates tenant-specific code paths in the product core. |
| Tabbed Single-Page Layout (`/configuracion`) | Unifies administration under one coherent screen rather than fragmenting into sub-routes (`/configuracion/usuarios`, `/configuracion/roles`). | Deep sub-routes: Forces unnecessary route transitions and full page re-fetches for managing partners performing daily administrative tasks. |
