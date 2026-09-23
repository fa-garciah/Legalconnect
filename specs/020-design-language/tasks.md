---
description: "Task list for 020-design-language"
---

# Tasks: The Product's Visual Language

**Input**: Design documents from `/specs/020-design-language/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md)

**Tests**: **Included and mandatory.** Constitution v1.5.0 requires strict TDD order (each test task preceding its implementation task). Because slice `020` is already built (shipped in commit `1f50d25`), tasks below are marked `[X]` **only** where both the code file and the automated test proving it can be explicitly cited. Tasks without test proof or representing genuinely uncompleted work are marked `[ ]`.

**Organization**: Grouped by user story matching `spec.md`:
- US1 = `US21-EP00-FND-ApplyProductVisualIdentity` (Priority: P1, MVP)
- US2 = Interface legibility and WCAG contrast (Priority: P2)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to (US1, US2)
- Exact file paths and specific test names are included in every task

## Path Conventions

Frontend only — `frontend/src/app/`, `frontend/tests/component/`. No backend files touched.

## TDD exemptions in force

Constitution exemption 4 covers purely visual adjustments without logic (styles, copy, layout). However, token contracts, font replacements, and accessibility bounds (WCAG 1.4.11 boundary contrast, copy claim restrictions, and `aria-hidden` attributes) are codified test-first in `frontend/tests/component/theme-tokens.test.tsx` and `frontend/tests/component/auth/AuthCard.test.tsx`.

## Open items carried from plan.md — not yet closed in code or repo artifacts

1. **D2 pill-shaped buttons and inputs**: Vendored components (`frontend/src/components/ui/button.tsx` and `frontend/src/components/ui/input.tsx`) remain stock `rounded-md`.
2. **SC-004 contrast measurement table**: Formal markdown contrast table recording every text-on-surface and icon-on-surface token pair across the design system has not been compiled into a spec document.
3. **SC-005 single-value brand repaint demonstration**: The one-value `--brand` repaint demonstration across screens has not been recorded.
4. **Approval Checklist in `spec.md`**: Items 4–7 in `spec.md` (lines 220–227) remain unchecked awaiting CC technical-lead sign-off.
5. **Auth fields component test**: `frontend/tests/component/auth/fields.test.tsx` was not created in commit `1f50d25`, leaving `frontend/src/app/(auth)/fields.tsx` unverified by a dedicated test suite.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Test harness and stylesheet baseline verification.

- [X] T001 Verify frontend test infrastructure and design token test harness setup in `frontend/tests/component/theme-tokens.test.tsx` (Proved by: implementation file `frontend/src/app/globals.css` and test suite `'the theme contract'` in `frontend/tests/component/theme-tokens.test.tsx`)
- [X] T002 Verify animation utility package configuration in `frontend/src/app/globals.css` (Proved by: implementation file `frontend/src/app/globals.css` and test `'imports the animation utilities as a package, not the retired plugin'` in `frontend/tests/component/theme-tokens.test.tsx`)

---

## Phase 2: Foundational (Theme Tokens & Typography Integration)

**Purpose**: Core theme tokens in `globals.css` and Google Fonts configuration in `layout.tsx`.

### Tests for Theme Tokens & Fonts ⚠️ Write first, watch them fail

- [X] T003 [P] [US1] Unit/contract test for brand color (`#3730A3`), hover partner (`#2D2582`), tint, and primary utility mapping (FR-004) in `frontend/tests/component/theme-tokens.test.tsx` (Tests: `'sets the brand primary rather than leaving the vendor default'` and `'keeps the decided brand and its pressed state — FR-004'`)
- [X] T004 [P] [US1] Unit/contract test that the ground is a warm surface rather than pure white (FR-006, D3) in `frontend/tests/component/theme-tokens.test.tsx` (Test: `'grounds the product on a warm surface rather than pure white — FR-006, D3'`). *Corrected on review:* the test asserts `--background` only; the values of `--rail` and `--border` are NOT asserted.
- [X] T005 [P] [US1] Unit/contract test for secondary warm accent token (`--accent-warm: #b8843f`, `--accent-warm-tint`, `--accent-warm-foreground`) (FR-005) in `frontend/tests/component/theme-tokens.test.tsx` (Test: `'defines the secondary accent the brand cannot carry — FR-005'`)
- [X] T006 [P] [US1] Unit/contract test for dark theme removal (FR-011, D1) asserting no `.dark` class or `@custom-variant dark` in `frontend/tests/component/theme-tokens.test.tsx` (Test: `'declares no theme that nothing can reach'`)
- [X] T007 [P] [US1] Unit/contract test for radius scale derivation (`--radius: 0.875rem`) (FR-007) and accordion keyframes in `frontend/tests/component/theme-tokens.test.tsx` (Tests: `'defines the radius scale the components derive their corners from'`, `'declares the accordion keyframes that lived in the prototype JS config'`)
- [X] T008 [P] [US1] Unit/contract test for density tokens (`--space-control-h`, `--space-row-h`, `--space-card-p`, `--space-page-gutter`) (FR-008) in `frontend/tests/component/theme-tokens.test.tsx` (Test: `'names its density rather than guessing per screen — FR-008'`)
- [X] T009 [P] [US1] Unit/contract test for five-step named type scale (FR-001) in `frontend/tests/component/theme-tokens.test.tsx` (Test: `'defines a named type scale rather than ad-hoc sizes — FR-001'`)
- [X] T010 [P] [US1] Unit/contract test for tabular numbers on `td` and `.tabular` (FR-003) and display font token exposure (FR-002) in `frontend/tests/component/theme-tokens.test.tsx` (Tests: `'renders record identifiers with tabular figures — FR-003'`, `'exposes the display family as its own token, so headings do not hardcode it — FR-002'`)

### Implementation for Theme Tokens & Fonts

- [X] T011 [US1] Implement palette, warm surfaces, secondary accent, density tokens, radius scale, type scale, tabular numbers, and dark theme removal in `frontend/src/app/globals.css` (Proved by: file `frontend/src/app/globals.css` and tests in `frontend/tests/component/theme-tokens.test.tsx` listed in T003–T010)
- [X] T012 [P] [US1] Contract test verifying removal of scaffold font (`Geist`) and loading of exactly two typefaces (`Newsreader` serif and `Public_Sans` sans) (FR-002, SC-002) in `frontend/tests/component/theme-tokens.test.tsx` (Tests: `'loads no scaffold typeface — FR-002, SC-002'`, `'loads exactly two families: a serif for display, a sans for interface — FR-002'`)
- [X] T013 [US1] Replace scaffold fonts in `frontend/src/app/layout.tsx` with `Newsreader` and `Public_Sans` from `next/font/google`, exposing `--font-newsreader` and `--font-public-sans` variables (FR-002, SC-002) (Proved by: file `frontend/src/app/layout.tsx` and tests in `frontend/tests/component/theme-tokens.test.tsx` cited in T012)

**Checkpoint**: Foundation ready — product-wide tokens and typography active.

---

## Phase 3: User Story 1 - The product reads as one decided thing (Priority: P1) 🎯 MVP

**Goal**: Deliver a cohesive visual identity across all screens, including unchromed authentication routes outside the shell.

**Independent Test**: Load existing screens and auth screens. Confirm one type scale, palette, warm surfaces, serif display headers, and no scaffold defaults (`Geist`).

### Tests for User Story 1 ⚠️ Write first, watch them fail

- [X] T014 [P] [US1] Component test for `AuthCard` frame structure: display serif screen title, rendered form preservation, and top corner navigation link in `frontend/tests/component/auth/AuthCard.test.tsx` (Tests: `'names the screen in the display serif — FR-010'`, `'still renders the form it frames'`, `'renders an optional link in the top corner, as the reference places it'`)
- [X] T015 [P] [US1] Component test for `AuthCard` decorative fiscal voucher (`aria-hidden="true"`, tabular figures) and truthful claims constraint (no CFDI stamping/invoicing promises) in `frontend/tests/component/auth/AuthCard.test.tsx` (Tests: `'shows the fiscal voucher, hidden from assistive technology'`, `'claims only what the product already does — no invoicing or stamping promises'`)

### Implementation for User Story 1

- [X] T016 [US1] Implement `AuthCard` layout frame with brand panel, decorative fiscal voucher, honest claims footer, and serif page heading in `frontend/src/app/(auth)/AuthCard.tsx` (FR-010) (Proved by: file `frontend/src/app/(auth)/AuthCard.tsx` and tests in `frontend/tests/component/auth/AuthCard.test.tsx` cited in T014–T015)
- [X] T017 [P] [US1] Component test for authentication input fields (`IconField` leading icon hidden from assistive technology, `PasswordField` visibility toggle with `aria-pressed` and `type="button"`) in `frontend/tests/component/auth/auth-fields.test.tsx` (Tests: `IconField`, `PasswordField` suites). The `--space-control-h` height is applied in `fields.tsx` but is NOT asserted by any test. *Corrected on review: first draft marked this not done because it looked for a `fields.test.tsx` that was never the file name.*
- [X] T018 [US1] Implement reusable authentication form fields (`IconField`, `PasswordField`) in `frontend/src/app/(auth)/fields.tsx` (Proved by: `frontend/tests/component/auth/auth-fields.test.tsx`)
- [ ] T019 [US1] Update vendored `components/ui/button.tsx` and `components/ui/input.tsx` to support pill-shaped controls (D2) (GENUINELY NOT DONE — deferred per Decision D2 and spec.md approval checklist; vendored components remain stock `rounded-md`)

**Checkpoint**: User Story 1 MVP fully functional in core token layers and auth presentation, with deferred pill styling and dedicated field test pending.

---

## Phase 4: User Story 2 - The interface is legible to everybody who uses it (Priority: P2)

**Goal**: Interface legibility, WCAG 2.1 AA text contrast (4.5:1 / 3:1), and WCAG 1.4.11 UI control boundary contrast (3:1).

**Independent Test**: Measure contrast of every text and border token pair; verify existing component and e2e test suites pass with zero regressions.

### Tests for User Story 2 ⚠️ Write first, watch them fail

- [X] T020 [P] [US2] Contrast test for input control boundaries (WCAG 1.4.11) asserting `--input` border reaches >= 3:1 on card and ground in `frontend/tests/component/theme-tokens.test.tsx` (Test: `'the input border reaches 3:1 on the card and on the ground'`)
- [X] T021 [US2] Retune `--input` token to `#968a77` (3.39:1 on card, 3.19:1 on ground) in `frontend/src/app/globals.css` (FR-012, WCAG 1.4.11) (Proved by: file `frontend/src/app/globals.css` and test `'the input border reaches 3:1 on the card and on the ground'` in `frontend/tests/component/theme-tokens.test.tsx`)
- [X] T022 [P] [US2] Contrast test for `AuthCard` brand panel text asserting small text uses `primary-foreground` and avoids ochre on indigo (3.03:1 failure) in `frontend/tests/component/auth/AuthCard.test.tsx` (Test: `'keeps small panel text off the ochre, which reads only 3.03:1 on indigo'`)
- [X] T023 [US2] Ensure small text on `BrandPanel` in `frontend/src/app/(auth)/AuthCard.tsx` uses `text-primary-foreground` with opacity rather than `text-accent-warm` (FR-012) (Proved by: file `frontend/src/app/(auth)/AuthCard.tsx` and test `'keeps small panel text off the ochre, which reads only 3.03:1 on indigo'` in `frontend/tests/component/auth/AuthCard.test.tsx`)

### Verification & Documentation for User Story 2

- [X] T024 [US2] Produce and record the complete contrast measurement table for every text-on-surface and non-text token pair (SC-004, FR-012) (Proved by: `specs/020-design-language/contrast.md` — 19 pairs measured from the live tokens on 2026-09-23, 0 failing)
- [ ] T025 [US2] Regression gate (SC-003): all existing tests pass under the new tokens with no assertion changed to accommodate the look. *Corrected on review — NOT met as written:* the unit and component tiers pass (466 tests), but the e2e tier has not been run under the new tokens (it needs the backend), and three assertions were changed deliberately, each documented in place: the dark-variant assertion inverted by D1 (`theme-tokens.test.tsx`), the keyboard order in `tests/component/auth/SignIn.test.tsx` extended for the password toggle, and the principal shape in `tests/unit/principal.test.ts`. Close by running `npm run test:e2e` and recording the three changes against SC-003.

**Checkpoint**: Core contrast rules enforced in code and tests; formal contrast documentation table pending.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verifications, demonstrations, and sign-offs across the feature slice.

- [X] T026 [P] Verify zero color literals exist in application code and all color utilities map to defined theme tokens (FR-009, SC-001) (Proved by: `frontend/src/app/globals.css` and test `'every colour utility referenced by a component has a token'` in `frontend/tests/component/theme-tokens.test.tsx`)
- [ ] T027 Demonstrate and record that a single-value change to `--brand` in `frontend/src/app/globals.css` visibly repaints all product screens without component edits (SC-005, FR-013) (GENUINELY NOT DONE — demonstration has not been recorded)
- [ ] T028 Complete the CC technical-lead sign-off on the Approval Checklist in `specs/020-design-language/spec.md` (lines 220–227) including formal acceptance of D1, D2, and contrast table (GENUINELY NOT DONE — checklist items remain unchecked in `spec.md`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Phase 2 tokens and fonts.
- **User Story 2 (Phase 4)**: Runs alongside/after US1 to verify contrast boundaries and regression gates.
- **Polish (Phase 5)**: Depends on core implementation being in place.

### Parallel Opportunities

- T003–T010 (token contract tests) can run in parallel in `theme-tokens.test.tsx`.
- T012 and T014–T015 can run in parallel with foundational test verification.
- T020 and T022 contrast tests can execute in parallel.

---

## Task Audit Summary

- **Total Tasks**: 28
- **Completed `[X]`**: 24 tasks (each citing the concrete implementation file and passing test assertion)
- **Open `[ ]`**: 4 tasks (T019 deferred vendored pill controls D2, T025 SC-003 not met as written — e2e not yet run, three assertions deliberately changed, T027 unrecorded repaint demonstration SC-005, T028 uncompleted spec sign-off)
