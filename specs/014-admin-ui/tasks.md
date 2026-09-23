---
description: "Task list for 014-admin-ui"
---

# Tasks: Firm Administration (`/configuracion`)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [contracts/admin-screens.md](./contracts/admin-screens.md)

**Tests**: **Included and mandatory** — the constitution's strict TDD. Every test task is written,
run, and **seen to fail** before the implementation task under it begins.

**Authorship note**: `spec.md` and `plan.md` were drafted with Antigravity (`agy`) and corrected on
review (Decision 5 added; FR-010, Decision 2's status and Decision 3's point 5 corrected; plan paths
and Principle VI fixed). `agy` reached its quota before this file and the contract, which were
written directly.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency)
- **[Story]**: US1 users & invitations · US2 roles & positions · US3 permissions matrix

## Gates that decide what can start

- **Decision 3** (invitation link in the issue response) gates Phase 2 A and all of US1's invite
  flow. **Decision 5** (members' email) gates Phase 2 B only; US1 can ship without it using the
  directory fallback described in the contract (§1.2).
- Nothing in this list reaches `main` before the matching Approval Checklist line is signed.

---

## Phase 1: Setup

- [ ] T001 Create `frontend/src/configuracion/` with `types.ts` (DTOs matching
      contracts/admin-screens.md §1–§2) and an empty `api.ts`; create `frontend/src/app/configuracion/`
      with a placeholder `page.tsx` that renders nothing yet. No navigation change yet.

---

## Phase 2: Foundational — backend (BLOCKS the frontend stories)

### A. The invitation link (Decision 3)

- [ ] T002 Write `backend/tests/contract/invitation-issue-link.test.ts`: a `201` from
      `POST /tenant/invitations` carries `invitationLink` of the form `/aceptar/{raw}`; the same shape
      is returned when the email ALREADY holds a live membership (`002/FR-029`); SHA-256 of `{raw}`
      equals the stored `reference_hash`; `GET /tenant/invitations` never contains the link; the
      `invitation.issued` audit row contains no token. **Run it; see it fail.**
- [ ] T003 In `backend/src/modules/invitation/invitation.controller.ts`, stop discarding
      `rawReferenceToken` returned by `InvitationService.issue()` and add `invitationLink` to the
      response only. Do not add it to `InvitationRow`, the audit metadata or any log line.
- [ ] T004 Amend `specs/002-identity-membership/contracts/tenant-invitations.md` §POST to record the
      new field and the reason (email delivery unavailable), in the same PR.

### B. Members with their email (Decision 5 — only after sign-off)

- [ ] T005 [P] Write `backend/tests/integration/isolation/members-email-isolation.test.ts`: a
      dual-membership identity acting in firm A never reads an email that belongs only to firm B's
      members; with NO tenant active, no member email is readable at all. **Run it; see it fail.**
- [ ] T006 [P] Write `backend/tests/contract/tenant-members.test.ts`: `GET /tenant/members` returns
      `membershipId`, `email`, `archetype`, `positionName` for live memberships of the active tenant;
      `SA` and `MP` get `200`, every other archetype `403`; a revoked membership is absent; each call
      writes one audit entry. **Run it; see it fail.**
- [ ] T007 Write `backend/drizzle/0044_identity_email_for_tenant_admins.sql`: one `SELECT` policy on
      `identity` for `lc_app`, guard FIRST — `app.tenant_id` set AND a live membership of that identity
      in that tenant. Record in its header why the guard is the whole of its safety (see `0043`).
- [ ] T008 Implement `backend/src/modules/membership/members.controller.ts` (`GET /tenant/members`,
      `@Capability('membership.read_tenant')`, audited) and register it in the membership module.
- [ ] T009 Run `npm run test:isolation && npm run test:rls && npm run verify:role`; all green before
      any frontend task consumes the route.

**Checkpoint**: the two API changes exist, are tested, and isolation is proven.

---

## Phase 3: User Story 1 — Users and invitations (P1) 🎯 MVP

- [ ] T010 [P] [US1] Unit tests in `frontend/tests/unit/configuracion/user-schema.test.ts`: email
      required and well-formed; the role list offered to an `MP` excludes `SA`; to an `SA` it includes
      every internal archetype. **See them fail.**
- [ ] T011 [US1] Implement `frontend/src/configuracion/schema.ts` (zod) and the role-offer function
      mirroring `backend/src/modules/invitation/archetype-rank.ts`.
- [ ] T012 [P] [US1] Component test `frontend/tests/component/configuracion/InviteUserDialog.test.tsx`:
      submits `{ email, targetArchetype }` through `apiFetch`; a refusal renders through `016a`'s
      classifier. **See it fail.**
- [ ] T013 [P] [US1] Component test `frontend/tests/component/configuracion/InvitationLinkModal.test.tsx`:
      shows `window.location.origin + invitationLink`; "Copiar enlace" writes it to the clipboard;
      the warning that it will not be shown again is present; nothing reaches browser storage;
      closing discards it. **See it fail.**
- [ ] T014 [P] [US1] Component test `frontend/tests/component/configuracion/PendingInvitationsTable.test.tsx`:
      rows show role, issue and expiry dates; "Revocar" asks for confirmation before calling revoke;
      empty state copy. **See it fail.**
- [ ] T015 [P] [US1] Component test `frontend/tests/component/configuracion/UserListTable.test.tsx`:
      shows email when `GET /tenant/members` is available, falls back to position + role labelled
      "Correo no disponible" otherwise; the last `SA` offers no "Desactivar". **See it fail.**
- [ ] T016 [US1] Implement `frontend/src/configuracion/api.ts` (invitations, members/directory,
      revoke calls) and the four components in `frontend/src/app/configuracion/components/`.
- [ ] T017 [US1] Implement the "Usuarios e invitaciones" tab in `frontend/src/app/configuracion/page.tsx`.
- [ ] T018 [US1] Add a test in `frontend/tests/unit/` asserting `configuracion` is `available: true`
      with `requiredArchetypes: ['SA', 'MP']`, then flip it in `frontend/src/shell/navigation-items.ts`
      and add its row to `frontend/src/authz/capability-matrix.ts` so `capability-matrix-sync.test.ts`
      stays green.

**Checkpoint**: an SA invites a person, copies the link, the person accepts at `/aceptar/{raw}`.

---

## Phase 4: User Story 2 — Roles and positions (P2)

- [ ] T019 [P] [US2] Unit tests `frontend/tests/unit/configuracion/position-schema.test.ts`: name
      required, trimmed, case-insensitive duplicate refused client-side. **See them fail.**
- [ ] T020 [P] [US2] Component test `ChangeArchetypeDialog.test.tsx`: rendered for `SA` only
      (`membership.change_archetype`); disabled for the last `SA`. **See it fail.**
- [ ] T021 [P] [US2] Component test `PositionCatalogTable.test.tsx`: active and retired positions;
      "Nuevo cargo" and "Retirar" only for `directory.manage_catalog`. **See it fail.**
- [ ] T022 [P] [US2] Component test `AssignPositionDialog.test.tsx`: offers active positions only;
      calls `PATCH /tenant/directory/entries/{membershipId}/position`. **See it fail.**
- [ ] T023 [US2] Implement the position schema, the three components and the "Cargos y roles" tab.

---

## Phase 5: User Story 3 — Read-only permissions matrix (P3)

- [ ] T024 [P] [US3] Unit test `frontend/tests/unit/configuracion/matrix-view-model.test.ts`: every
      capability in `capability-matrix.ts` lands in exactly one domain group; the six internal
      archetypes are the columns; nothing is left ungrouped. **See it fail.**
- [ ] T025 [US3] Implement `frontend/src/configuracion/matrix-view-model.ts`.
- [ ] T026 [P] [US3] Component test `PermissionsMatrixView.test.tsx`: no control on the tab is
      interactive; the explanatory callout is present. **See it fail.**
- [ ] T027 [US3] Implement `PermissionsMatrixView.tsx` and the "Matriz de permisos" tab.

---

## Phase 6: Polish

- [ ] T028 Add every new component to `frontend/tests/component/spanish-copy.test.tsx`.
- [ ] T029 Write `frontend/tests/e2e/configuracion.spec.ts`: invite → copy link → accept at
      `/aceptar/{raw}` → the new member appears; revoke an invitation; retire a position.
- [ ] T030 Full gates: backend `npm test -- --coverage`; frontend `npm test`, `npm run test:e2e`,
      `npm run typecheck`, `npm run lint`, `npm run build`; zero colour literals.
- [ ] T031 Write `specs/014-admin-ui/quickstart.md` and `quickstart-results.md`, recording what was
      verified by hand and what was not.
- [ ] T032 CC technical-lead sign-off on the spec's Approval Checklist (Decisions 1, 2, 3, 5).

---

## Dependencies

- Phase 2 A (T002–T004) blocks every US1 task that invites (T012, T013, T016, T017).
- Phase 2 B (T005–T009) is needed only for the email column; US1 ships without it via the fallback.
- US2 and US3 depend on Phase 1 only and can run in parallel with US1 once Phase 2 A is done.
- `navigation-items.ts` flips (T018) in the same PR as the first working tab, never before.

## Summary

- **Total**: 32 tasks · **Done**: 0 · **Open**: 32
- **Approval-gated**: T002–T004 (Decision 3), T005–T009 (Decision 5), T032.
