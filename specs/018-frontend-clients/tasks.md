# Tasks: Client Screens & the Design System They Need

**Input**: Design documents from `/specs/018-frontend-clients/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md) —
all present. This file consumes their decisions; it does not make them.

**Tests**: Included and **mandatory**. The constitution's testing discipline is strict TDD:
test first → verify it fails → minimum code that passes → refactor. One exemption is
claimed, scoped and compensated — see the note before Phase 2b.

**Organization**: Tasks are grouped by user story so each can be implemented and tested
independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an incomplete task
- **[Story]**: `[US1]`, `[US2]`, `[US3]` — maps to spec.md's user stories
- Paths are repository-relative. This is a **frontend-only** slice; `backend/` is untouched.

**The prototype** is at `../cosmic-legalconnect/` relative to the repository root. It and
`LegalConnect - FrontEnd/` are byte-identical; use either. Deleting the duplicate is the
technical lead's call, not a task here — plan.md open item 3.

---

## Phase 1: Setup (Gates & Dependencies)

**⚠️ T001 was a hard gate. It is cleared** — the catalogue now reads `006 + 018` on the
three rows, with the joint-delivery convention written into `EP03`'s amendment note.
**T002 is cleared too**: the palette is confirmed as the decided brand, so T008 may write
those values without further sign-off.

- [X] T001 *(done 2026-08-28)* Amend `specs/master-user-story-catalog.md` per plan.md Decision 1: change the `Slice` column of `US02-EP03-CLM-SearchAndFilterClients`, `US03-EP03-CLM-AddOrUpdateClientProfile` and `US07-EP03-CLM-RestoreWithdrawnClient` from `006` to `006 + 018`, and add a note establishing the joint-delivery convention — `006` built the API half, `018` builds the half a person touches. **No task below may start until this merges.**
- [X] T002 *(confirmed 2026-08-28 — the palette is the decided brand, not a placeholder)* Confirm the brand palette with the technical lead before T008 writes it into `frontend/src/app/globals.css` (plan.md open item 2). `#3730A3` / `#2D2582` / `#1A1A1A` / `#6B7280` / `#EEF2FF` were read out of the prototype's markup, where they are hardcoded rather than themed. If they were a generator's placeholder, changing them now is one line; changing them after 49 components consume the token is not.
- [X] T003 Add the component and animation dependencies to `frontend/package.json`: the 27 `@radix-ui/*` packages the ported components import, plus `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` and **`tw-animate-css`**. Do **not** add `tailwindcss-animate` — it is a plugin for the previous major version and will not load (research D2).
- [X] T004 [P] Add the form dependencies to `frontend/package.json`: `react-hook-form`, `zod`, `@hookform/resolvers`. Present in the prototype's manifest and unused there; this is a fresh adoption (spec, second section).
- [X] T005 Run `npm install` in `frontend/` and confirm `npx tsc --noEmit` still passes on the existing tree before anything is ported.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the design system, without which no screen can be built.

**⚠️ CRITICAL**: no user story work can begin until this phase is complete.

### 2a — The theme (the actual migration)

> Research D1: the components are stock, contain no `@apply`, and reference only token
> utilities. **The version difference lives entirely in how the theme is declared.** Get
> this file right and the 49 components work unmodified; get it wrong and all 49 render
> unstyled. It is therefore first, and alone.

- [X] T006 Write `frontend/tests/component/theme-tokens.test.tsx` — **fails first**: mount a bare element for each token group and assert the computed colour is not the browser default, proving the token resolved. Covers primary, foreground, muted, background, card, popover, border, input, ring, destructive, accent, secondary. This is what catches a typo in a token name, which otherwise surfaces as "everything looks slightly wrong" much later.
- [X] T007 Rewrite `frontend/src/app/globals.css` per contracts/design-system.md §3.1: define every token in `@theme`, import `tw-animate-css`, declare the dark variant, and add the `--radius` scale plus the `accordion-down` / `accordion-up` keyframes that lived in the prototype's JS config.
- [X] T008 Set the brand tokens in `frontend/src/app/globals.css` from T002's confirmed palette — `--color-primary` and its foreground, the hover pairing, text and muted, and the `#EEF2FF` tint for accent. **These are defined here and nowhere else**: research D3 found the prototype hardcodes `#3730A3` fifty times as `bg-[#3730A3]`, overriding a theme it never set. That practice is being replaced, not copied.
- [X] T009 Run `npx vitest run tests/component/theme-tokens.test.tsx` in `frontend/` and confirm it passes.

### 2b — The component library

> **Exemption 2 (tool-generated code) is claimed here, and only here.** The 49 components
> are unmodified vendor scaffolding — `button.tsx` is verbatim upstream, checked. Writing
> unit tests for a `cva` variant map nobody wrote tests the vendor, not this product.
>
> **What the exemption does not cover** is whether they survived the move, which is T013.
> A component that lands silently broken is worse than one that never landed, because the
> next slice will build on it before finding the fault.

- [X] T010 [P] Copy `../cosmic-legalconnect/lib/utils.ts` to `frontend/src/lib/utils.ts` — the `cn` helper every component imports.
- [X] T011 Copy **all 51 files** from `../cosmic-legalconnect/components/ui/` to `frontend/src/components/ui/`, **unmodified** (research D1). That is the 49 components plus the two hooks that live in the same folder and that components import — `use-mobile.tsx` (used by `sidebar.tsx`) and `use-toast.ts` (used by `toaster.tsx`). Omitting the hooks leaves those two components failing to compile, which is the likeliest way this task goes wrong.
- [X] T012 Verify the `@` alias resolves for the ported components in both the app and the test runner. `frontend/tsconfig.json` and `frontend/vitest.config.ts` already map `@` to `./src`, so this should hold — **check it on the first component rather than the forty-ninth**, since a mismatch fails identically for all of them and finding it early is the difference between one fix and a re-copy.
- [X] T013 Write `frontend/tests/component/ui-smoke.test.tsx` — FR-024, SC-012. Iterate **every** ported component and assert it mounts and produces DOM. Components needing a trigger or provider — dialog, tooltip, popover, accordion, sheet, drawer — are mounted in the state their upstream examples use. **Nothing is skipped**: a skipped component is precisely the one that rots unnoticed. Asserts rendering, not appearance (contracts/design-system.md §5).
- [X] T014 Run `npx vitest run tests/component/ui-smoke.test.tsx` in `frontend/` and confirm all 49 pass, then `npx tsc --noEmit` and `npm run lint`.
- [X] T015 Confirm `tailwindcss-animate` is absent from `frontend/package.json` and that the six animation utilities the components use — `animate-in`, `animate-out`, `animate-accordion-down`, `animate-accordion-up`, `animate-caret-blink`, `animate-pulse` — resolve through `tw-animate-css`.

### 2c — The seams into `016a`

- [X] T016 [P] Add the four mirror rows to `frontend/src/authz/capability-matrix.ts` — `client.read`, `client.create`, `client.update`, `client.deactivate` — exactly as data-model.md's control map states (`016a/FR-025`, FR-016).
- [X] T017 Add the same four rows to the hand-transcribed `FOUR_ZERO_FOUR_MATRIX_FIXTURE` in `frontend/tests/unit/capability-matrix-sync.test.ts`, transcribed from `004/spec.md` rather than copied from T016 — the fixture is only a check if it comes from the other source.
- [X] T018 [P] Add the `clientes` entry to `frontend/src/shell/navigation-items.ts` with the six internal archetypes (`016a/FR-002`, FR-017). This is the **first entry the registry has ever held**; `016a` shipped it empty by design for exactly this moment.
- [X] T019 [P] Write `frontend/src/clients/types.ts` — the wire shapes, transcribed by hand from `006/contracts/client-api.md` per data-model.md, never inferred from a live response.

**Checkpoint**: the theme resolves, 49 components render, the shell knows about `/clientes`
and the mirror knows about four capabilities. Screens can now be built.

---

## Phase 3: User Story 1 — Find a client (Priority: P1) 🎯 MVP

**Goal**: a firm can open the client directory and find a party by name or status.

**Independent Test**: register clients through the API, open `/clientes`, filter by a
fragment of a name and by status, and page through. Delivers a usable, searchable directory
with no create, edit or withdraw path present.

### Tests for User Story 1 ⚠️ Write first, confirm they fail

- [X] T020 [P] [US1] Write `frontend/tests/unit/client-api.test.ts` — the list call's request shape: `q`, `status`, `limit` and `cursor` are sent only when present; a whitespace-only `q` is omitted rather than sent empty; the cursor is passed back **verbatim and never parsed** (data-model.md).
- [X] T021 [P] [US1] Write `frontend/tests/component/clientes/ClientDirectory.test.tsx` — quickstart Scenario 2: the four columns render; a client with no RFC shows a dash rather than an empty cell; the two empty states read **differently** (SC-005); loading, error, both empties and populated are mutually distinguishable.
- [X] T022 [P] [US1] Write the filtering cases into `frontend/tests/component/clientes/ClientDirectory.test.tsx` — clearing the box restores the whole directory, changing a filter resets the cursor, and **the response is rendered as received**. Assert no client-side re-filtering: given a response of N items, N are shown (FR-003). This is the assertion that protects `006`'s SC-007a from the one place `006` cannot observe.
- [X] T023 [P] [US1] Write `frontend/tests/e2e/client-directory.spec.ts` — the story end to end against a running backend, including a filtered page that is **full** rather than short while more matches remain.

### Implementation for User Story 1

- [X] T024 [US1] Implement `frontend/src/clients/api.ts` — the five calls, every one through `apiFetch` and nothing else (contracts/client-screens.md §0). Include the boundary conversions from data-model.md, written **once**: `rfc: trim() || null` outbound, `rfc ?? ''` inbound, and `kind` omitted entirely from the edit payload.
- [X] T025 [US1] Implement `frontend/src/app/clientes/ClientFilters.tsx` — the name field and the status filter, **debounced** so typing settles into one request rather than one per keystroke (spec Assumptions).
- [X] T026 [US1] Implement `frontend/src/app/clientes/ClientDirectory.tsx` — the table, the five states from data-model.md, and "Cargar más" when `nextCursor` is non-null. Uses `016a`'s `LoadingState`, `ErrorState`, `EmptyState` and `QueryBoundary`; adds no sixth state.
- [X] T027 [US1] Implement `frontend/src/app/clientes/page.tsx` — the route, rendering the directory inside the shell it already sits in.
- [X] T028 [US1] Run `npx vitest run tests/unit/client-api.test.ts tests/component/clientes/ClientDirectory.test.tsx` and confirm both pass; then `npx playwright test tests/e2e/client-directory.spec.ts` with the backend running on 3001 (quickstart Prerequisites).

**Checkpoint**: US1 is fully functional and demonstrable on its own. A firm has a searchable
client directory. Nothing can be created, edited or withdrawn yet.

---

## Phase 4: User Story 2 — Register and correct a client (Priority: P2)

**Goal**: intake and correction, with validation — the story the original request was about.

**Independent Test**: open the create form, submit it empty and see every problem at once,
correct them, save, then reopen the record and change the name.

**Depends on**: US1, for the surface the form is reached from.

### Tests for User Story 2 ⚠️ Write first, confirm they fail

- [X] T029 [P] [US2] Write `frontend/tests/unit/client-schema.test.ts` — data-model.md's four rules, and the four things the browser deliberately does **not** assert. Include the case that most invites a well-meaning bug: **an oddly-shaped RFC of reasonable length is VALID**, because `006` does not validate format either and a stricter browser would refuse records the server accepts (research D4).
- [X] T030 [P] [US2] Write `frontend/tests/component/clientes/ClientFormDialog.test.tsx` — quickstart Scenario 3: no errors before interaction (FR-007); every problem shown together on submit (SC-002); **no request sent** for a form already known invalid (SC-003); a server refusal renders against the form preserving what was typed (FR-009).
- [X] T031 [P] [US2] Write the `kind`-immutability cases into `frontend/tests/component/clientes/ClientFormDialog.test.tsx` — it renders as read-only **text** rather than a disabled control on edit, and **the edit payload omits it entirely**. The natural implementation spreads the loaded client into the body, which sends `kind` and earns a `400` on every save; this deserves its own assertion rather than incidental coverage.
- [X] T032 [P] [US2] Write `frontend/tests/e2e/client-intake.spec.ts` — create and edit end to end, including the directory updating with no manual reload (FR-011).

### Implementation for User Story 2

- [X] T033 [US2] Implement `frontend/src/clients/schema.ts` — the validation schema with Spanish messages that say what to do rather than what failed (FR-006, data-model.md's message table).
- [X] T034 [US2] Implement `frontend/src/app/clientes/ClientFormDialog.tsx` — one component for create and edit. Validation mode set so untouched fields stay clean and all errors surface together. On success, invalidate the list query rather than patching optimistically (spec Assumptions — `006` has refusals a browser cannot predict, which is exactly when optimism is wrong).
- [X] T035 [US2] Wire the "Nuevo cliente" and "Editar" controls into `frontend/src/app/clientes/ClientDirectory.tsx`, each gated on its capability id read from the mirror — **never on an archetype list** (data-model.md: an archetype list is a second source of truth that drifts from `004` with nothing to catch it).
- [X] T036 [US2] Map server refusals onto the form in `frontend/src/app/clientes/ClientFormDialog.tsx`, per contracts/client-screens.md §2.4. The `409`-on-a-withdrawn-client case refreshes the record; every other code takes the classifier's copy unchanged. **Do not modify `refusal-bucket.ts`** (research D6).
- [X] T037 [US2] Run `npx vitest run tests/unit/client-schema.test.ts tests/component/clientes/ClientFormDialog.test.tsx` in `frontend/`, then `npx playwright test tests/e2e/client-intake.spec.ts`, and confirm all pass.

**Checkpoint**: US1 and US2 both work. A firm can find, register and correct clients.

---

## Phase 5: User Story 3 — Withdraw a client, and undo it (Priority: P3)

**Goal**: withdrawal with a confirmation that tells the truth about its consequences, and a
restore path so a mis-click is cheap.

**Independent Test**: withdraw a client, confirm it is refused for new matters and still
resolves on existing ones, then restore it and confirm it is usable again.

**Depends on**: US1 for the surface; independent of US2.

### Tests for User Story 3 ⚠️ Write first, confirm they fail

- [X] T038 [P] [US3] Write `frontend/tests/component/clientes/WithdrawDialog.test.tsx` — confirmation required before anything is sent (FR-012), and the confirmation states **both** halves: no new matters, existing matters unaffected. That second sentence is a test row because withdrawal sounds destructive and `006/FR-008` guarantees it is not; omitting it would make people hesitate over a reversible action.
- [X] T039 [P] [US3] Write the restore cases into `frontend/tests/component/clientes/WithdrawDialog.test.tsx` — reachable from a withdrawn client's record (FR-013), no confirmation because it is the undo, and `409 already_active` handled.
- [X] T040 [P] [US3] Write `frontend/tests/e2e/client-withdraw-restore.spec.ts` — the round trip end to end, asserting the restored client is usable for a new matter and that the backend recorded two distinct audit entries (`006`'s SC-007b).

### Implementation for User Story 3

- [X] T041 [US3] Implement `frontend/src/app/clientes/WithdrawDialog.tsx` — one component serving both withdraw and restore, since both are row 28.
- [X] T042 [US3] Wire both controls into `frontend/src/app/clientes/ClientDirectory.tsx`, gated on `client.deactivate`. Whoever may withdraw may restore (`006/FR-004a`), so one capability governs both — and `PL` is offered neither, which is `006`'s Q1.
- [X] T043 [US3] Run `npx vitest run tests/component/clientes/WithdrawDialog.test.tsx` in `frontend/`, then `npx playwright test tests/e2e/client-withdraw-restore.spec.ts`, and confirm both pass.

**Checkpoint**: all three stories work independently.

---

## Phase 6: Cross-Cutting — Accessibility, Permissions, Copy

> These span all three screens and are cheaper to verify once the screens exist than to
> assert three times while building them. They are **not** optional polish: FR-014,
> FR-025, FR-026 and FR-027 are requirements, and SC-006, SC-007, SC-013 and SC-014 are
> acceptance criteria.

- [X] T044 [P] Write `frontend/tests/component/clientes/accessibility.test.tsx` — FR-025, FR-026, SC-013. Every control keyboard-reachable with visible focus; every input carries an associated label; every validation error is announced and tied to its input. **Include the Escape case explicitly**: closing via the button usually works by accident while Escape takes a different path out of the component, so it is the one most likely to be missed.
- [X] T045 Fix whatever T044 finds, in `frontend/src/app/clientes/`. The ported components implement most of this already — the likely failures are in this slice's own wrappers: a `<div onClick>` where a `<Button>` belongs, or a label rendered as a sibling rather than associated.
- [X] T046 [P] Write `frontend/tests/component/clientes/control-visibility.test.tsx` — SC-006. For each of the six internal archetypes, assert the controls rendered match that archetype's row exactly: 0 shown that the server would refuse, 0 hidden that it would permit.
- [X] T047 [P] Add this slice's components to `frontend/tests/component/spanish-copy.test.tsx` — FR-023, SC-009. Extend `016a`'s existing test rather than writing a second one.
- [X] T048 Write the SC-014 case into `frontend/tests/e2e/client-directory.spec.ts` — open the edit dialog from row 4 of page 3 of a filtered directory, close it, and confirm the filter, page and scroll position all survive (FR-027). This is the property the dialog choice was made for; if it fails, the choice bought nothing.
- [X] T049 Confirm `frontend/tests/e2e/hidden-item-still-refused.spec.ts` — `016a`'s existing test — still passes and now has a real capability to exercise. SC-007: issuing a hidden control's request by other means is refused identically to the case where it was never hidden.

---

## Phase 7: Polish & Verification

- [X] T050 Run `grep -rE "#[0-9A-Fa-f]{6}" frontend/src/app/clientes frontend/src/clients frontend/src/authz frontend/src/shell` and confirm **zero matches** (contracts/design-system.md §3.4). A colour literal in a new file silently opts that element out of every future palette change; the prototype does it fifty times and that is the practice being replaced.
- [X] T051 [P] Confirm `git diff` is empty for `frontend/src/feedback/refusal-bucket.ts`, `frontend/src/lib/api-client.ts`, `frontend/src/shell/Shell.tsx`, `frontend/src/shell/Header.tsx`, `frontend/src/shell/NavigationMenu.tsx` and `frontend/src/shell/TenantSwitcher.tsx` — research D7 lists what changing each would cost.
- [X] T052 [P] Confirm `git diff --stat backend/` is empty. This slice consumes `006`'s API and changes no backend file.
- [X] T053 Run the full frontend suite: `npx vitest run && npm run lint && npx tsc --noEmit` in `frontend/`. `016a`'s 60 existing tests must pass **unchanged** (SC-011).
- [X] T054 Run the backend suite once to confirm it is untouched: `npm test` in `backend/` — 1315/1315.
- [X] T055 [P] Verify SC-010 by extending `frontend/tests/e2e/responsive.spec.ts` — `016a`'s existing viewport test — to cover `/clientes` and its two dialogs at both viewports: no horizontal scrolling of the page body.
- [X] T056 Execute every scenario in [quickstart.md](./quickstart.md) end to end and write `specs/018-frontend-clients/quickstart-results.md` in the format `006` and `017` used — pass/fail per scenario, plus an honest section for anything found and fixed during validation. Prior slices found between one and three real defects this way; budget for it rather than being surprised.
- [X] T057 Update the Approval Checklist in `specs/018-frontend-clients/spec.md` and mark the testing-exemption item satisfied — the exemption is claimed in plan.md's Constitution Check and compensated by T013.

---

## Phase 8: Handoff

- [X] T058 [P] Record in `specs/016a-frontend-shell/` that the navigation registry and capability mirror now have their first real entries, and that `016a`'s "starts empty, a domain slice adds its own" design worked as written. `016a` predicted this slice; closing the loop keeps that prediction visible rather than folklore.
- [X] T059 [P] Note in `specs/006-client-case-core/quickstart-results.md` that four of its eleven capabilities now have a rendered surface, and that the remaining seven — including the product's first `assigned`-scope rows — still do not.
- [X] T060 Add a line to `docs/` or the slice roadmap recording that `018` establishes the frontend design system, so the next frontend slice imports from `src/components/ui/` rather than porting again.

---

## Dependencies & Execution Order

```
Phase 1 Setup (T001 is a hard gate; T002 gates T008)
   └─> Phase 2 Foundational (T006–T019) ── BLOCKS EVERYTHING
          │   2a theme → 2b components → 2c seams
          └─> Phase 3 US1 Directory (T020–T028)   🎯 MVP
                 ├─> Phase 4 US2 Form (T029–T037)
                 └─> Phase 5 US3 Withdraw (T038–T043)
                        └─> Phase 6 Cross-cutting (T044–T049)
                               └─> Phase 7 Polish (T050–T057)
                                      └─> Phase 8 Handoff (T058–T060)
```

**US2 and US3 are genuinely independent of each other.** Both need US1's directory as the
surface they are reached from, but neither touches the other's files — two people can take
them in parallel after T028.

### The critical path inside Phase 2

`T006 → T007 → T008 → T009` is a strict chain and **everything downstream depends on it**.
If the theme is wrong, all 49 components render unstyled and every subsequent failure looks
like a component problem. T006 exists so that failure is loud and early rather than diffuse
and late.

### Parallel Opportunities

- **T003, T004** — two dependency groups, one manifest, so sequential in practice; T004 is marked `[P]` because it touches a different section and can be prepared alongside
- **T010, T016, T018, T019** — utils, mirror, navigation, types: four independent files
- **T020–T023** — US1's four test files
- **T029–T032** — US2's four test files (T031 extends T030's file, so it is *not* parallel with it)
- **T038–T040** — US3's three test files (T039 extends T038's file)
- **T044, T046, T047** — three independent cross-cutting test files
- **T051, T052, T055** — independent verifications
- **T058, T059, T060** — handoff notes, three different files

### Two-person strategy

Phase 2 splits cleanly: one person takes the theme chain (T006–T009) and the component port
(T010–T015), the other takes the seams (T016–T019) and can write US1's tests (T020–T023)
while waiting. They converge at T024.

After T028, one takes US2 and the other US3.

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1 — T001–T005, with **T001 merged first**
2. Phase 2 — T006–T019 (blocks everything)
3. Phase 3 — T020–T028
4. **STOP and VALIDATE**: a firm can open `/clientes` and find any client by name or status,
   inside the real shell, against real data

Phase 2 is heavy for an MVP that delivers one screen. That is Q1's accepted cost: the
component library and theme are shared by every later frontend slice, and splitting them
would mean paying the theme migration more than once.

### Incremental Delivery

1. Setup + Foundational → a working design system and the seams into the shell
2. **US1** → a searchable client directory **(MVP)**
3. **US2** → intake and correction, with validation
4. **US3** → withdrawal and restore
5. Cross-cutting → accessibility, permissions, copy
6. Polish → the literal sweep, the untouched-files proof, quickstart validation

### What to demo at each checkpoint

- After US1: type three letters and watch a 400-client directory narrow; clear it and watch
  it come back
- After US2: submit an empty form and see every problem at once, in Spanish; save a client
  with no RFC
- After US3: withdraw a client, read the confirmation, restore it, open a new matter against
  it — and show the two audit entries in the backend

---

## Notes

- `[P]` = different files, no dependency on an incomplete task
- `[Story]` maps each task to a spec.md user story for traceability
- **Verify each test fails before implementing it** — the constitution requires the PR
  history to evidence the ordering, not merely the final state
- Commit after each task or logical group
- **49 components, ~12 called.** Q1's accepted cost. T013 is what stops the other 37 rotting
- **No colour literal in any new file** (T050) — greppable, and worth grepping
- The prototype exists twice and is byte-identical. Deleting one is not a task here because
  it is the technical lead's call, but plan.md open item 3 records it — a future reader
  porting from the stale copy is the risk

## Definition of Done

The constitution's *Definition of Done*, plus this slice's own:

- [X] T001's catalog amendment merged before any other task began
- [X] T002's palette confirmed before T008 consumed it
- [X] All 49 components render (T013), none skipped — FR-024, SC-012. A coverage guard
      fails when a component in `src/components/ui/` has no case
- [X] The theme resolves every token the components reference (T006)
- [X] `tailwindcss-animate` absent; `tw-animate-css` present and the six utilities resolve —
      verified in the **built** CSS, not only in the manifest
- [X] Validation shows every problem at once and sends nothing for a known-invalid form
- [X] The edit payload omits `kind` — asserted at the unit tier and proved against the real
      `006`, where a successful save is the evidence
- [X] No client-side re-filtering: a response of N items renders N items
- [X] Controls gated by capability id, never by archetype list; mirror and `004` agree
- [X] WCAG 2.1 AA on all three screens, Escape-closes-dialog included (T044). The Escape
      case was genuinely broken and is fixed — see quickstart-results Defect 3
- [X] Filter, page and scroll survive a dialog round trip (T048) — FR-027's whole purpose.
      Scroll was genuinely lost and is fixed — Defect 4
- [X] **0 colour literals** in any file this slice wrote
- [X] `refusal-bucket.ts`, `api-client.ts` and `TenantSwitcher` confirmed unmodified
- [ ] ~~`Shell.tsx`, `Header.tsx`, `NavigationMenu.tsx` unmodified~~ — **not met.** First one
      utility class to stop a wide grid scrolling the page sideways, then a full restyle to
      the design the product owner supplied after the slice closed. Everything `016a`
      specified still holds — one shell, the active firm always named, archetype filtering
      through the same function. Deviation 1 in quickstart-results.md
- [ ] ~~`backend/` confirmed unmodified~~ — **not met, necessarily.** `src/main.ts` and
      `.env.example`, both for CORS: no browser could reach the API at all without it, and
      no previous slice made a browser request. Deviation 2 in quickstart-results.md
- [X] `016a`'s existing tests pass unchanged — full frontend suite 223/223, backend 1315/1315
- [X] All copy in Spanish, verified by the extended test
- [X] `quickstart-results.md` written honestly, including the six defects found and fixed
